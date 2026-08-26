package apiglimpse

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestEnvelopeVersion(t *testing.T) {
	if EnvelopeVersion != 1 {
		t.Fatalf("EnvelopeVersion = %d, want 1", EnvelopeVersion)
	}
}

func TestRedactHeaders(t *testing.T) {
	in := map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer secret-token",
		"X-Request-Id":  "req-abc-123",
		"Cookie":        "sid=1",
	}
	out := RedactHeaders(in)
	if out["authorization"] != "[REDACTED]" {
		t.Fatalf("authorization: %q", out["authorization"])
	}
	if out["cookie"] != "[REDACTED]" {
		t.Fatalf("cookie: %q", out["cookie"])
	}
	if out["content-type"] != "application/json" {
		t.Fatalf("content-type: %q", out["content-type"])
	}
	if out["x-request-id"] != "req-abc-123" {
		t.Fatalf("x-request-id: %q", out["x-request-id"])
	}
}

func TestRedactValue(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Bearer abc", "Bearer [REDACTED]"},
		{"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature", "[REDACTED_JWT]"},
		{"ssn 123-45-6789 here", "[REDACTED_SSN]"},
		{"short", "short"},
	}
	for _, tc := range cases {
		if got := RedactValue(tc.in); got != tc.want {
			t.Fatalf("RedactValue(%q)=%q want %q", tc.in, got, tc.want)
		}
	}
}

func TestShapeBodyMatchesFixture(t *testing.T) {
	fixture := loadJSON(t, "sample-shaped.json")

	reqBody := map[string]any{
		"email":    "user@example.com",
		"password": "s3cret",
		"profile": map[string]any{
			"name": "Ada",
			"age":  36,
		},
	}
	resBody := map[string]any{
		"id":    "usr_01",
		"email": "user@example.com",
		"token": "tok_live",
	}

	reqShape := ShapeBody(reqBody, 0)
	resShape := ShapeBody(resBody, 0)

	wantReq := fixture["request"].(map[string]any)["bodyShape"]
	wantRes := fixture["response"].(map[string]any)["bodyShape"]

	assertJSONEqual(t, wantReq, reqShape)
	assertJSONEqual(t, wantRes, resShape)
}

func TestCreateSampleMatchesFixture(t *testing.T) {
	want := loadJSON(t, "sample-shaped.json")

	sample := CreateSample(SampleInput{
		Method:     "POST",
		Path:       "/api/users",
		StatusCode: 201,
		LatencyMs:  42,
		RequestHeaders: map[string]string{
			"content-type":  "application/json",
			"authorization": "Bearer secret",
			"x-request-id":  "req-abc-123",
		},
		ResponseHeaders: map[string]string{
			"content-type": "application/json",
			"set-cookie":   "sid=abc",
		},
		RequestHeaderNames:  []string{"content-type", "authorization", "x-request-id"},
		ResponseHeaderNames: []string{"content-type", "set-cookie"},
		RequestBody: map[string]any{
			"email":    "user@example.com",
			"password": "s3cret",
			"profile": map[string]any{
				"name": "Ada",
				"age":  36,
			},
		},
		ResponseBody: map[string]any{
			"id":    "usr_01",
			"email": "user@example.com",
			"token": "tok_live",
		},
		HasRequestBody:  true,
		HasResponseBody: true,
		AuthObserved:    "bearer",
		Timestamp:       "2026-01-15T12:00:00.000Z",
	})

	gotBytes, err := json.Marshal(sample)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(gotBytes, &got); err != nil {
		t.Fatal(err)
	}
	assertJSONEqual(t, want, got)
}

func TestCreateEnvelopeMinimalFixture(t *testing.T) {
	want := loadJSON(t, "envelope-v1-minimal.json")
	env := Envelope{
		Version: EnvelopeVersion,
		APIKey:  "ask_minimal",
		Samples: []Sample{},
		SentAt:  "2026-01-15T12:00:00.000Z",
	}
	gotBytes, err := json.Marshal(env)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(gotBytes, &got); err != nil {
		t.Fatal(err)
	}
	assertJSONEqual(t, want, got)
}

func TestCreateEnvelopeSampleFixture(t *testing.T) {
	want := loadJSON(t, "envelope-v1-sample.json")
	sample := CreateSample(SampleInput{
		Method:     "POST",
		Path:       "/api/users",
		StatusCode: 201,
		LatencyMs:  42,
		RequestHeaders: map[string]string{
			"content-type":  "application/json",
			"authorization": "Bearer secret",
			"x-request-id":  "req-abc-123",
		},
		ResponseHeaders: map[string]string{
			"content-type": "application/json",
			"set-cookie":   "sid=abc",
		},
		RequestHeaderNames:  []string{"content-type", "authorization", "x-request-id"},
		ResponseHeaderNames: []string{"content-type", "set-cookie"},
		RequestBody: map[string]any{
			"email":    "user@example.com",
			"password": "s3cret",
			"profile": map[string]any{
				"name": "Ada",
				"age":  36,
			},
		},
		ResponseBody: map[string]any{
			"id":    "usr_01",
			"email": "user@example.com",
			"token": "tok_live",
		},
		HasRequestBody:  true,
		HasResponseBody: true,
		AuthObserved:    "bearer",
		Timestamp:       "2026-01-15T12:00:00.000Z",
	})
	env := Envelope{
		Version: EnvelopeVersion,
		APIKey:  "ask_test_key_fixture",
		Samples: []Sample{sample},
		SentAt:  "2026-01-15T12:00:01.000Z",
	}
	gotBytes, err := json.Marshal(env)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(gotBytes, &got); err != nil {
		t.Fatal(err)
	}
	assertJSONEqual(t, want, got)
}

func TestValidateEnvelope(t *testing.T) {
	ok, _ := ValidateEnvelope(&Envelope{Version: 1, Samples: []Sample{}})
	if !ok {
		t.Fatal("expected ok")
	}
	ok, _ = ValidateEnvelope(&Envelope{Version: 2, Samples: []Sample{}})
	if ok {
		t.Fatal("expected reject v2")
	}
}

func TestObserveAuth(t *testing.T) {
	if got := ObserveAuth(map[string]string{"authorization": "Bearer x"}); got != "bearer" {
		t.Fatalf("got %q", got)
	}
	if got := ObserveAuth(map[string]string{"cookie": "a=b"}); got != "cookie" {
		t.Fatalf("got %q", got)
	}
	if got := ObserveAuth(map[string]string{}); got != "none" {
		t.Fatalf("got %q", got)
	}
}

func loadJSON(t *testing.T, name string) map[string]any {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func assertJSONEqual(t *testing.T, want, got any) {
	t.Helper()
	wn := normalizeJSON(want)
	gn := normalizeJSON(got)
	if !reflect.DeepEqual(wn, gn) {
		wb, _ := json.MarshalIndent(wn, "", "  ")
		gb, _ := json.MarshalIndent(gn, "", "  ")
		t.Fatalf("mismatch\nwant:\n%s\ngot:\n%s", wb, gb)
	}
}

// normalizeJSON re-encodes via encoding/json so number kinds align (float64).
func normalizeJSON(v any) any {
	b, err := json.Marshal(v)
	if err != nil {
		return v
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		return v
	}
	return out
}
