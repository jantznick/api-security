package apiglimpse

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func TestMiddlewarePostsEnvelope(t *testing.T) {
	var (
		mu      sync.Mutex
		gotBody []byte
		gotKey  string
		gotPath string
		posts   atomic.Int32
	)

	collector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotKey = r.Header.Get("X-API-Key")
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		gotBody = b
		mu.Unlock()
		posts.Add(1)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer collector.Close()

	rate := 1.0
	r := chi.NewRouter()
	r.Use(Middleware(Config{
		AgentURL:      collector.URL,
		APIKey:        "ask_test",
		SampleRate:    &rate,
		FlushInterval: 50 * time.Millisecond,
		MaxBatchSize:  1,
		HTTPClient:    collector.Client(),
	}))
	r.Post("/api/users", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"1","email":"a@b.co"}`))
	})

	body, _ := json.Marshal(map[string]any{"email": "a@b.co", "password": "x"})
	req := httptest.NewRequest(http.MethodPost, "/api/users", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer tok")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("app status %d", rr.Code)
	}

	deadline := time.Now().Add(2 * time.Second)
	for posts.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if posts.Load() == 0 {
		t.Fatal("expected collector POST")
	}
	if gotPath != "/v1/samples" {
		t.Fatalf("path %q", gotPath)
	}
	if gotKey != "ask_test" {
		t.Fatalf("api key %q", gotKey)
	}

	mu.Lock()
	defer mu.Unlock()
	var env Envelope
	if err := json.Unmarshal(gotBody, &env); err != nil {
		t.Fatal(err)
	}
	if env.Version != 1 {
		t.Fatalf("version %d", env.Version)
	}
	if env.APIKey != "ask_test" {
		t.Fatalf("envelope key %q", env.APIKey)
	}
	if len(env.Samples) != 1 {
		t.Fatalf("samples %d", len(env.Samples))
	}
	if env.Samples[0].Method != "POST" || env.Samples[0].Path != "/api/users" {
		t.Fatalf("sample %+v", env.Samples[0])
	}
	if env.Samples[0].AuthObserved != "bearer" {
		t.Fatalf("auth %q", env.Samples[0].AuthObserved)
	}
	if env.Samples[0].Request.Headers["authorization"] != "[REDACTED]" {
		t.Fatalf("headers %#v", env.Samples[0].Request.Headers)
	}
}

func TestMiddlewareFailOpenWhenCollectorDown(t *testing.T) {
	rate := 1.0
	r := chi.NewRouter()
	r.Use(Middleware(Config{
		AgentURL:       "http://127.0.0.1:1",
		APIKey:         "ask_x",
		SampleRate:     &rate,
		FlushInterval:  30 * time.Millisecond,
		RequestTimeout: 50 * time.Millisecond,
		MaxBatchSize:   1,
	}))
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/health", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}
	if got := rr.Body.String(); got != `{"status":"ok"}` {
		t.Fatalf("body %q", got)
	}
	time.Sleep(100 * time.Millisecond)
}

func TestMiddlewareCapturesJSONResponseShape(t *testing.T) {
	var (
		mu      sync.Mutex
		gotBody []byte
		posts   atomic.Int32
	)

	collector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		gotBody = b
		mu.Unlock()
		posts.Add(1)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer collector.Close()

	rate := 1.0
	r := chi.NewRouter()
	r.Use(Middleware(Config{
		AgentURL:      collector.URL,
		APIKey:        "ask_test",
		SampleRate:    &rate,
		FlushInterval: 50 * time.Millisecond,
		MaxBatchSize:  1,
		HTTPClient:    collector.Client(),
	}))
	r.Get("/json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"1","email":"a@b.co"}`))
	})

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/json", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}

	deadline := time.Now().Add(2 * time.Second)
	for posts.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if posts.Load() == 0 {
		t.Fatal("expected collector POST")
	}

	mu.Lock()
	defer mu.Unlock()
	var env Envelope
	if err := json.Unmarshal(gotBody, &env); err != nil {
		t.Fatal(err)
	}
	if len(env.Samples) != 1 {
		t.Fatalf("samples %d", len(env.Samples))
	}
	s := env.Samples[0]
	if s.ResponseBodyCaptured == nil || !*s.ResponseBodyCaptured {
		t.Fatalf("responseBodyCaptured=%v", s.ResponseBodyCaptured)
	}
	shape, ok := s.Response.BodyShape.(map[string]any)
	if !ok {
		// after json round-trip via marshal of sample in flush, BodyShape is map
		t.Fatalf("bodyShape type %T", s.Response.BodyShape)
	}
	props, _ := shape["properties"].(map[string]any)
	idField, _ := props["id"].(map[string]any)
	if idField["sample"] != "1" {
		t.Fatalf("id sample %#v", idField)
	}
	emailField, _ := props["email"].(map[string]any)
	if emailField["sample"] != "a@b.co" {
		t.Fatalf("email sample %#v", emailField)
	}
}

func TestMiddlewareSkipsBinaryResponse(t *testing.T) {
	var (
		mu      sync.Mutex
		gotBody []byte
		posts   atomic.Int32
	)

	collector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		gotBody = b
		mu.Unlock()
		posts.Add(1)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer collector.Close()

	rate := 1.0
	r := chi.NewRouter()
	r.Use(Middleware(Config{
		AgentURL:      collector.URL,
		APIKey:        "ask_test",
		SampleRate:    &rate,
		FlushInterval: 50 * time.Millisecond,
		MaxBatchSize:  1,
		HTTPClient:    collector.Client(),
	}))
	r.Get("/bin", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write([]byte{0x89, 0x50, 0x4e, 0x47})
	})

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/bin", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}

	deadline := time.Now().Add(2 * time.Second)
	for posts.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if posts.Load() == 0 {
		t.Fatal("expected collector POST")
	}

	mu.Lock()
	defer mu.Unlock()
	var env Envelope
	if err := json.Unmarshal(gotBody, &env); err != nil {
		t.Fatal(err)
	}
	s := env.Samples[0]
	if s.ResponseBodyCaptured == nil || *s.ResponseBodyCaptured {
		t.Fatalf("expected responseBodyCaptured=false, got %v", s.ResponseBodyCaptured)
	}
	if s.Response.BodyShape != nil {
		t.Fatalf("expected nil bodyShape, got %#v", s.Response.BodyShape)
	}
}

func TestMiddlewareEmptyBodyNotCaptured(t *testing.T) {
	var (
		mu      sync.Mutex
		gotBody []byte
		posts   atomic.Int32
	)

	collector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		gotBody = b
		mu.Unlock()
		posts.Add(1)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer collector.Close()

	rate := 1.0
	r := chi.NewRouter()
	r.Use(Middleware(Config{
		AgentURL:      collector.URL,
		APIKey:        "ask_test",
		SampleRate:    &rate,
		FlushInterval: 50 * time.Millisecond,
		MaxBatchSize:  1,
		HTTPClient:    collector.Client(),
	}))
	r.Get("/empty", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/empty", nil))
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status %d", rr.Code)
	}

	deadline := time.Now().Add(2 * time.Second)
	for posts.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if posts.Load() == 0 {
		t.Fatal("expected collector POST")
	}

	mu.Lock()
	defer mu.Unlock()
	var env Envelope
	if err := json.Unmarshal(gotBody, &env); err != nil {
		t.Fatal(err)
	}
	s := env.Samples[0]
	if s.ResponseBodyCaptured == nil || *s.ResponseBodyCaptured {
		t.Fatalf("expected responseBodyCaptured=false, got %v", s.ResponseBodyCaptured)
	}
	if s.Response.BodyShape != nil {
		t.Fatalf("expected nil bodyShape, got %#v", s.Response.BodyShape)
	}
}
