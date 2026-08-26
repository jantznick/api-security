package apiglimpse

import (
	"strings"
	"time"
)

// Sample is one traffic observation in envelope v1.
type Sample struct {
	Method                string `json:"method"`
	Path                  string `json:"path"`
	StatusCode            int    `json:"statusCode"`
	LatencyMs             int64  `json:"latencyMs"`
	AuthObserved          string `json:"authObserved"`
	Timestamp             string `json:"timestamp"`
	ResponseBodyCaptured  *bool  `json:"responseBodyCaptured,omitempty"`
	Caller                any    `json:"caller,omitempty"`
	Request               IOSide `json:"request"`
	Response              IOSide `json:"response"`
}

// IOSide is the request or response half of a sample.
type IOSide struct {
	ContentType *string           `json:"contentType"`
	HeaderNames []string          `json:"headerNames"`
	Headers     map[string]string `json:"headers"`
	BodyShape   any               `json:"bodyShape"`
}

// Envelope is the POST /v1/samples body (version 1).
type Envelope struct {
	Version int      `json:"version"`
	APIKey  string   `json:"apiKey"`
	Samples []Sample `json:"samples"`
	SentAt  string   `json:"sentAt"`
}

// SampleInput is the capture-time input for CreateSample.
type SampleInput struct {
	Method          string
	Path            string
	StatusCode      int
	LatencyMs       int64
	RequestHeaders  map[string]string
	ResponseHeaders map[string]string
	// RequestHeaderNames / ResponseHeaderNames preserve key order when set.
	RequestHeaderNames  []string
	ResponseHeaderNames []string
	RequestBody         any
	ResponseBody        any
	HasRequestBody         bool
	HasResponseBody        bool
	ResponseBodyCaptured   *bool
	Caller                 any
	AuthObserved           string
	Timestamp              string
}

// CreateSample builds one traffic sample with redacted headers and shaped bodies.
func CreateSample(in SampleInput) Sample {
	ts := in.Timestamp
	if ts == "" {
		ts = time.Now().UTC().Format(time.RFC3339Nano)
	}
	auth := in.AuthObserved
	if auth == "" {
		auth = "none"
	}
	method := strings.ToUpper(in.Method)
	if method == "" {
		method = "GET"
	}
	path := in.Path
	if path == "" {
		path = "/"
	}

	reqHeaders := in.RequestHeaders
	if reqHeaders == nil {
		reqHeaders = map[string]string{}
	}
	resHeaders := in.ResponseHeaders
	if resHeaders == nil {
		resHeaders = map[string]string{}
	}

	reqNames := in.RequestHeaderNames
	if len(reqNames) == 0 {
		reqNames = headerNames(reqHeaders)
	} else {
		reqNames = lowerNames(reqNames)
	}
	resNames := in.ResponseHeaderNames
	if len(resNames) == 0 {
		resNames = headerNames(resHeaders)
	} else {
		resNames = lowerNames(resNames)
	}

	var reqShape any
	if in.HasRequestBody {
		reqShape = ShapeBody(in.RequestBody, 0)
	}
	var resShape any
	if in.HasResponseBody {
		resShape = ShapeBody(in.ResponseBody, 0)
	}

	return Sample{
		Method:               method,
		Path:                 path,
		StatusCode:           in.StatusCode,
		LatencyMs:            in.LatencyMs,
		AuthObserved:         auth,
		Timestamp:            ts,
		ResponseBodyCaptured: in.ResponseBodyCaptured,
		Caller:               in.Caller,
		Request: IOSide{
			ContentType: contentType(reqHeaders),
			HeaderNames: reqNames,
			Headers:     RedactHeaders(reqHeaders),
			BodyShape:   reqShape,
		},
		Response: IOSide{
			ContentType: contentType(resHeaders),
			HeaderNames: resNames,
			Headers:     RedactHeaders(resHeaders),
			BodyShape:   resShape,
		},
	}
}

// CreateEnvelope wraps samples for POST /v1/samples.
func CreateEnvelope(apiKey string, samples []Sample) Envelope {
	if samples == nil {
		samples = []Sample{}
	}
	return Envelope{
		Version: EnvelopeVersion,
		APIKey:  apiKey,
		Samples: samples,
		SentAt:  time.Now().UTC().Format(time.RFC3339Nano),
	}
}

// ValidateEnvelope checks envelope version and samples array presence.
func ValidateEnvelope(env *Envelope) (ok bool, errMsg string) {
	if env == nil {
		return false, "Body must be an object"
	}
	if env.Version != EnvelopeVersion {
		return false, "Unsupported envelope version"
	}
	if env.Samples == nil {
		return false, "samples must be an array"
	}
	return true, ""
}

func contentType(headers map[string]string) *string {
	for _, key := range []string{"content-type", "Content-Type"} {
		if v, ok := headers[key]; ok && v != "" {
			ct := strings.TrimSpace(strings.Split(v, ";")[0])
			return &ct
		}
	}
	for k, v := range headers {
		if strings.EqualFold(k, "content-type") && v != "" {
			ct := strings.TrimSpace(strings.Split(v, ";")[0])
			return &ct
		}
	}
	return nil
}

func headerNames(headers map[string]string) []string {
	names := make([]string, 0, len(headers))
	for k := range headers {
		names = append(names, strings.ToLower(k))
	}
	return names
}

func lowerNames(names []string) []string {
	out := make([]string, len(names))
	for i, n := range names {
		out[i] = strings.ToLower(n)
	}
	return out
}

// ObserveAuth classifies auth from request headers (pre-redaction).
func ObserveAuth(headers map[string]string) string {
	for k, v := range headers {
		if strings.EqualFold(k, "authorization") && reBearer.MatchString(v) {
			return "bearer"
		}
	}
	for k := range headers {
		if strings.EqualFold(k, "cookie") {
			return "cookie"
		}
	}
	return "none"
}

// ResolveCaller builds SF3 caller hints. Explicit service name / X-Service-Name preferred.
func ResolveCaller(headers map[string]string, serviceName string) map[string]any {
	lower := map[string]string{}
	for k, v := range headers {
		lower[strings.ToLower(k)] = v
	}
	explicit := strings.TrimSpace(firstNonEmpty(lower["x-service-name"], lower["x-client-name"], serviceName))
	ua := strings.ToLower(lower["user-agent"])
	family := "unknown"
	switch {
	case strings.Contains(ua, "curl/") || ua == "curl":
		family = "curl"
	case strings.Contains(ua, "mozilla/") || strings.Contains(ua, "chrome/") || strings.Contains(ua, "safari/") || strings.Contains(ua, "firefox/") || strings.Contains(ua, "edg/"):
		family = "browser"
	case strings.Contains(ua, "axios") || strings.Contains(ua, "node-fetch") || strings.Contains(ua, "go-http") || strings.Contains(ua, "python-requests") || strings.Contains(ua, "okhttp") || strings.Contains(ua, "java/") || strings.Contains(ua, "apiglimpse"):
		family = "sdk"
	}
	if explicit != "" {
		return map[string]any{
			"key":             "svc:" + strings.ToLower(explicit),
			"label":           explicit,
			"serviceName":     explicit,
			"userAgentFamily": family,
		}
	}
	return map[string]any{
		"key":             "ua:" + family,
		"label":           "ua:" + family,
		"serviceName":     nil,
		"userAgentFamily": family,
	}
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
