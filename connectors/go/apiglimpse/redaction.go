package apiglimpse

import (
	"math"
	"regexp"
	"strings"
)

// EnvelopeVersion is the wire-protocol version shared with @apiglimpse/shared.
const EnvelopeVersion = 1

const (
	maxString     = 64
	maxHeaderVal  = 128
	maxDepth      = 4
	maxKeys       = 40
	maxArrayItems = 5
)

// SensitiveHeaderNames are always redacted before leaving the app process.
var SensitiveHeaderNames = map[string]struct{}{
	"authorization":       {},
	"cookie":              {},
	"set-cookie":          {},
	"x-api-key":           {},
	"x-auth-token":        {},
	"proxy-authorization": {},
}

var (
	reBearer = regexp.MustCompile(`(?i)^Bearer\s+`)
	reJWT    = regexp.MustCompile(`^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`)
	reSSN    = regexp.MustCompile(`\b\d{3}-\d{2}-\d{4}\b`)
	reCard   = regexp.MustCompile(`\b(?:\d[ -]*?){13,19}\b`)
)

// TruncateString truncates to max bytes like the JS helper.
func TruncateString(value string, max int) string {
	if max <= 0 {
		max = maxString
	}
	if len(value) <= max {
		return value
	}
	return value[:max] + "…"
}

// RedactHeaders redacts sensitive header values; keys are lowercased.
func RedactHeaders(headers map[string]string) map[string]string {
	out := make(map[string]string, len(headers))
	for rawKey, rawVal := range headers {
		key := strings.ToLower(rawKey)
		if _, sens := SensitiveHeaderNames[key]; sens {
			out[key] = "[REDACTED]"
			continue
		}
		out[key] = TruncateString(rawVal, maxHeaderVal)
	}
	return out
}

// RedactValue applies best-effort secret pattern redaction for strings.
func RedactValue(value string) string {
	if reBearer.MatchString(value) {
		return "Bearer [REDACTED]"
	}
	if reJWT.MatchString(value) {
		return "[REDACTED_JWT]"
	}
	if reSSN.MatchString(value) {
		return "[REDACTED_SSN]"
	}
	if reCard.MatchString(value) {
		return "[REDACTED_CARD]"
	}
	return TruncateString(value, maxString)
}

func isSecretKey(key string) bool {
	lower := strings.ToLower(key)
	if lower == "cvv" || lower == "cvc" {
		return true
	}
	return strings.Contains(lower, "password") ||
		strings.Contains(lower, "secret") ||
		strings.Contains(lower, "token") ||
		strings.Contains(lower, "ssn")
}

// ShapeBody converts a JSON-like value into a truncated shape sample.
// Mirrors packages/shared shapeBody caps and secret-key redaction.
func ShapeBody(body any, depth int) map[string]any {
	if body == nil {
		return map[string]any{"type": "null"}
	}
	if depth >= maxDepth {
		return map[string]any{"type": "truncated"}
	}

	switch v := body.(type) {
	case string:
		return map[string]any{"type": "string", "sample": RedactValue(v)}
	case bool:
		return map[string]any{"type": "boolean", "sample": v}
	case int:
		return map[string]any{"type": "integer", "sample": v}
	case int8:
		return map[string]any{"type": "integer", "sample": int(v)}
	case int16:
		return map[string]any{"type": "integer", "sample": int(v)}
	case int32:
		return map[string]any{"type": "integer", "sample": int(v)}
	case int64:
		return map[string]any{"type": "integer", "sample": v}
	case uint:
		return map[string]any{"type": "integer", "sample": v}
	case uint8:
		return map[string]any{"type": "integer", "sample": uint(v)}
	case uint16:
		return map[string]any{"type": "integer", "sample": uint(v)}
	case uint32:
		return map[string]any{"type": "integer", "sample": uint(v)}
	case uint64:
		return map[string]any{"type": "integer", "sample": v}
	case float32:
		return shapeFloat(float64(v))
	case float64:
		return shapeFloat(v)
	case []any:
		n := len(v)
		limit := n
		if limit > maxArrayItems {
			limit = maxArrayItems
		}
		items := make([]any, 0, limit)
		for i := 0; i < limit; i++ {
			items = append(items, ShapeBody(v[i], depth+1))
		}
		return map[string]any{
			"type":   "array",
			"length": n,
			"items":  items,
		}
	case map[string]any:
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		if len(keys) > maxKeys {
			keys = keys[:maxKeys]
		}
		properties := make(map[string]any, len(keys))
		for _, key := range keys {
			if isSecretKey(key) {
				properties[key] = map[string]any{"type": "string", "sample": "[REDACTED]"}
			} else {
				properties[key] = ShapeBody(v[key], depth+1)
			}
		}
		return map[string]any{
			"type":          "object",
			"properties":    properties,
			"truncatedKeys": len(v) > maxKeys,
		}
	default:
		return map[string]any{"type": "unknown"}
	}
}

func shapeFloat(v float64) map[string]any {
	if !math.IsNaN(v) && !math.IsInf(v, 0) && v == math.Trunc(v) && v >= float64(math.MinInt64) && v <= float64(math.MaxInt64) {
		return map[string]any{"type": "integer", "sample": int64(v)}
	}
	return map[string]any{"type": "number", "sample": v}
}
