package apiglimpse

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Config controls the chi/net/http middleware.
type Config struct {
	AgentURL  string
	APIKey    string
	// ServiceName labels this app as a topology caller (API_SENSOR_SERVICE_NAME).
	ServiceName string
	// SampleRate is 0–1. nil means default 1.0 (sample everything).
	SampleRate *float64
	FlushInterval           time.Duration
	MaxBatchSize            int
	MaxBufferSize           int
	RequestTimeout          time.Duration
	CircuitFailureThreshold int
	CircuitOpenFor          time.Duration
	// HTTPClient optional override (tests).
	HTTPClient *http.Client
}

// ConfigFromEnv builds Config from API_SENSOR_* environment variables.
func ConfigFromEnv() Config {
	cfg := DefaultConfig()
	if v := os.Getenv("API_SENSOR_AGENT_URL"); v != "" {
		cfg.AgentURL = v
	}
	if v := os.Getenv("API_SENSOR_KEY"); v != "" {
		cfg.APIKey = v
	}
	if v := os.Getenv("API_SENSOR_SERVICE_NAME"); v != "" {
		cfg.ServiceName = v
	}
	if v := os.Getenv("API_SENSOR_SAMPLE_RATE"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			cfg.SampleRate = &f
		}
	}
	return cfg
}

// DefaultConfig returns Express-middleware-aligned defaults.
func DefaultConfig() Config {
	rate := 1.0
	return Config{
		AgentURL:                "http://localhost:8080",
		APIKey:                  "",
		SampleRate:              &rate,
		FlushInterval:           time.Second,
		MaxBatchSize:            50,
		MaxBufferSize:           500,
		RequestTimeout:          2 * time.Second,
		CircuitFailureThreshold: 3,
		CircuitOpenFor:          15 * time.Second,
	}
}

type sensor struct {
	cfg       Config
	mu        sync.Mutex
	buffer    []Sample
	flushing  bool
	failures  int
	openUntil time.Time
	client    *http.Client
	stopCh    chan struct{}
	rate      float64
}

// Middleware returns chi-compatible middleware that samples traffic and
// asynchronously POSTs envelope v1 to the hosted agent. Fail-open: never
// blocks or fails the customer request because of API Glimpse.
func Middleware(cfg Config) func(http.Handler) http.Handler {
	c := mergeConfig(DefaultConfig(), cfg)

	rate := 1.0
	if c.SampleRate != nil {
		rate = *c.SampleRate
	}

	s := &sensor{
		cfg:    c,
		rate:   rate,
		buffer: make([]Sample, 0, c.MaxBatchSize),
		stopCh: make(chan struct{}),
		client: c.HTTPClient,
	}
	if s.client == nil {
		s.client = &http.Client{Timeout: c.RequestTimeout}
	}

	go s.loop()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !s.shouldSample() {
				next.ServeHTTP(w, r)
				return
			}

			start := time.Now()
			var reqBody []byte
			func() {
				defer func() { _ = recover() }()
				reqBody, r = peekRequestBody(r)
			}()

			rw := &captureWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rw, r)

			func() {
				defer func() { _ = recover() }()
				s.enqueue(r, rw, reqBody, start)
			}()
		})
	}
}

func mergeConfig(base, over Config) Config {
	if over.AgentURL != "" {
		base.AgentURL = over.AgentURL
	}
	if over.APIKey != "" {
		base.APIKey = over.APIKey
	}
	if over.ServiceName != "" {
		base.ServiceName = over.ServiceName
	}
	if over.SampleRate != nil {
		base.SampleRate = over.SampleRate
	}
	if over.FlushInterval > 0 {
		base.FlushInterval = over.FlushInterval
	}
	if over.MaxBatchSize > 0 {
		base.MaxBatchSize = over.MaxBatchSize
	}
	if over.MaxBufferSize > 0 {
		base.MaxBufferSize = over.MaxBufferSize
	}
	if over.RequestTimeout > 0 {
		base.RequestTimeout = over.RequestTimeout
	}
	if over.CircuitFailureThreshold > 0 {
		base.CircuitFailureThreshold = over.CircuitFailureThreshold
	}
	if over.CircuitOpenFor > 0 {
		base.CircuitOpenFor = over.CircuitOpenFor
	}
	if over.HTTPClient != nil {
		base.HTTPClient = over.HTTPClient
	}
	return base
}

func (s *sensor) loop() {
	t := time.NewTicker(s.cfg.FlushInterval)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			s.flush()
		case <-s.stopCh:
			return
		}
	}
}

func (s *sensor) shouldSample() bool {
	if s.rate >= 1 {
		return true
	}
	if s.rate <= 0 {
		return false
	}
	return rand.Float64() < s.rate
}

func (s *sensor) enqueue(r *http.Request, rw *captureWriter, reqBody []byte, start time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.buffer) >= s.cfg.MaxBufferSize {
		s.buffer = s.buffer[1:]
	}
	reqHeaders := flattenHeader(r.Header)
	resHeaders := flattenHeader(rw.Header())
	var reqParsed any
	hasReq := false
	if len(reqBody) > 0 {
		if err := json.Unmarshal(reqBody, &reqParsed); err == nil {
			hasReq = true
		}
	}
	var resParsed any
	hasRes := false
	resCT := strings.ToLower(resHeaders["content-type"])
	// Prefer JSON Content-Type; still accept bodies that parse as JSON when CT unset.
	// Skip obvious binary / streaming content types.
	skipRes := strings.Contains(resCT, "octet-stream") ||
		strings.Contains(resCT, "event-stream") ||
		strings.HasPrefix(resCT, "image/") ||
		strings.HasPrefix(resCT, "audio/") ||
		strings.HasPrefix(resCT, "video/") ||
		strings.Contains(resCT, "multipart/")
	if !skipRes && len(rw.body) > 0 {
		if resCT == "" || strings.Contains(resCT, "application/json") || strings.Contains(resCT, "+json") {
			if err := json.Unmarshal(rw.body, &resParsed); err == nil {
				hasRes = true
			}
		}
	}
	path := r.URL.Path
	if path == "" {
		path = "/"
	}
	captured := hasRes
	sample := CreateSample(SampleInput{
		Method:               r.Method,
		Path:                 path,
		StatusCode:           rw.status,
		LatencyMs:            time.Since(start).Milliseconds(),
		RequestHeaders:       reqHeaders,
		ResponseHeaders:      resHeaders,
		RequestHeaderNames:   headerNamesFromHTTP(r.Header),
		ResponseHeaderNames:  headerNamesFromHTTP(rw.Header()),
		RequestBody:          reqParsed,
		ResponseBody:         resParsed,
		HasRequestBody:       hasReq,
		HasResponseBody:      hasRes,
		ResponseBodyCaptured: &captured,
		Caller:               ResolveCaller(reqHeaders, s.cfg.ServiceName),
		AuthObserved:         ObserveAuth(reqHeaders),
	})
	s.buffer = append(s.buffer, sample)
	if len(s.buffer) >= s.cfg.MaxBatchSize {
		go s.flush()
	}
}

func (s *sensor) recordFailure() {
	s.failures++
	if s.failures >= s.cfg.CircuitFailureThreshold {
		s.openUntil = time.Now().Add(s.cfg.CircuitOpenFor)
		s.failures = 0
	}
}

func (s *sensor) recordSuccess() {
	s.failures = 0
	s.openUntil = time.Time{}
}

func (s *sensor) flush() {
	s.mu.Lock()
	if s.flushing || len(s.buffer) == 0 || time.Now().Before(s.openUntil) {
		s.mu.Unlock()
		return
	}
	s.flushing = true
	n := s.cfg.MaxBatchSize
	if n > len(s.buffer) {
		n = len(s.buffer)
	}
	batch := make([]Sample, n)
	copy(batch, s.buffer[:n])
	s.buffer = s.buffer[n:]
	apiKey := s.cfg.APIKey
	agentURL := strings.TrimRight(s.cfg.AgentURL, "/")
	timeout := s.cfg.RequestTimeout
	client := s.client
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.flushing = false
		s.mu.Unlock()
	}()

	env := CreateEnvelope(apiKey, batch)
	body, err := json.Marshal(env)
	if err != nil {
		s.mu.Lock()
		s.recordFailure()
		s.mu.Unlock()
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, agentURL+"/v1/samples", bytes.NewReader(body))
	if err != nil {
		s.mu.Lock()
		s.recordFailure()
		s.mu.Unlock()
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", apiKey)

	res, err := client.Do(req)
	if err != nil {
		s.mu.Lock()
		s.recordFailure()
		s.mu.Unlock()
		return
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)

	s.mu.Lock()
	defer s.mu.Unlock()
	if res.StatusCode >= 500 {
		s.recordFailure()
		return
	}
	if res.StatusCode == http.StatusUnauthorized {
		return
	}
	s.recordSuccess()
}

type captureWriter struct {
	http.ResponseWriter
	status int
	body   []byte
}

func (w *captureWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *captureWriter) Write(b []byte) (int, error) {
	if len(w.body) < 64*1024 {
		remain := 64*1024 - len(w.body)
		if len(b) <= remain {
			w.body = append(w.body, b...)
		} else {
			w.body = append(w.body, b[:remain]...)
		}
	}
	return w.ResponseWriter.Write(b)
}

func peekRequestBody(r *http.Request) ([]byte, *http.Request) {
	if r.Body == nil {
		return nil, r
	}
	const max = 64 * 1024
	buf, err := io.ReadAll(io.LimitReader(r.Body, max+1))
	_ = r.Body.Close()
	if err != nil {
		r.Body = http.NoBody
		return nil, r
	}
	if len(buf) > max {
		r.Body = io.NopCloser(bytes.NewReader(buf))
		return nil, r
	}
	r.Body = io.NopCloser(bytes.NewReader(buf))
	return buf, r
}

func flattenHeader(h http.Header) map[string]string {
	out := make(map[string]string, len(h))
	for k, vals := range h {
		out[strings.ToLower(k)] = strings.Join(vals, ", ")
	}
	return out
}

func headerNamesFromHTTP(h http.Header) []string {
	names := make([]string, 0, len(h))
	for k := range h {
		names = append(names, strings.ToLower(k))
	}
	return names
}
