package com.apiglimpse;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Sample + envelope builders — mirrors packages/shared/src/envelope.js.
 */
public final class Envelope {

  private static final Pattern RE_BEARER = Pattern.compile("^Bearer\\s+", Pattern.CASE_INSENSITIVE);

  private static final ObjectMapper MAPPER = new ObjectMapper()
      .setSerializationInclusion(JsonInclude.Include.NON_NULL)
      .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, false);

  private Envelope() {}

  public static ObjectMapper mapper() {
    return MAPPER;
  }

  public static String isoNow() {
    Instant now = Instant.now();
    // Prefer millis precision like JS toISOString
    String s = now.toString();
    if (s.length() > 23 && s.endsWith("Z")) {
      // Instant.toString may have nanos; trim to millis when present
      int dot = s.indexOf('.');
      if (dot > 0) {
        String frac = s.substring(dot + 1, s.length() - 1);
        if (frac.length() > 3) {
          return s.substring(0, dot + 1) + frac.substring(0, 3) + "Z";
        }
      }
    }
    return s;
  }

  public static Map<String, Object> createSample(SampleInput in) {
    Map<String, String> reqHeaders = in.requestHeaders != null ? in.requestHeaders : Map.of();
    Map<String, String> resHeaders = in.responseHeaders != null ? in.responseHeaders : Map.of();

    List<String> reqNames = in.requestHeaderNames != null && !in.requestHeaderNames.isEmpty()
        ? lowerNames(in.requestHeaderNames)
        : headerNames(reqHeaders);
    List<String> resNames = in.responseHeaderNames != null && !in.responseHeaderNames.isEmpty()
        ? lowerNames(in.responseHeaderNames)
        : headerNames(resHeaders);

    String method = in.method == null || in.method.isBlank() ? "GET" : in.method.toUpperCase(Locale.ROOT);
    String path = in.path == null || in.path.isBlank() ? "/" : in.path;
    String auth = in.authObserved == null || in.authObserved.isBlank() ? "none" : in.authObserved;
    String ts = in.timestamp == null || in.timestamp.isBlank() ? isoNow() : in.timestamp;

    Map<String, Object> request = new LinkedHashMap<>();
    request.put("contentType", contentType(reqHeaders));
    request.put("headerNames", reqNames);
    request.put("headers", Redaction.redactHeaders(reqHeaders));
    request.put("bodyShape", in.hasRequestBody ? Redaction.shapeBody(in.requestBody) : null);

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("contentType", contentType(resHeaders));
    response.put("headerNames", resNames);
    response.put("headers", Redaction.redactHeaders(resHeaders));
    response.put("bodyShape", in.hasResponseBody ? Redaction.shapeBody(in.responseBody) : null);

    Map<String, Object> sample = new LinkedHashMap<>();
    sample.put("method", method);
    sample.put("path", path);
    sample.put("statusCode", in.statusCode);
    sample.put("latencyMs", in.latencyMs);
    sample.put("authObserved", auth);
    sample.put("timestamp", ts);
    if (in.responseBodyCaptured != null) {
      sample.put("responseBodyCaptured", in.responseBodyCaptured);
    }
    if (in.caller != null) {
      sample.put("caller", in.caller);
    }
    sample.put("request", request);
    sample.put("response", response);
    return sample;
  }

  public static Map<String, Object> createEnvelope(String apiKey, List<Map<String, Object>> samples) {
    Map<String, Object> env = new LinkedHashMap<>();
    env.put("version", Redaction.ENVELOPE_VERSION);
    env.put("apiKey", apiKey);
    env.put("samples", samples != null ? samples : new ArrayList<>());
    env.put("sentAt", isoNow());
    return env;
  }

  public static Map<String, Object> createEnvelope(
      String apiKey, List<Map<String, Object>> samples, String sentAt) {
    Map<String, Object> env = createEnvelope(apiKey, samples);
    env.put("sentAt", sentAt);
    return env;
  }

  public static ValidationResult validateEnvelope(Object body) {
    if (!(body instanceof Map<?, ?> map)) {
      return ValidationResult.fail("Body must be an object");
    }
    Object version = map.get("version");
    int v;
    if (version instanceof Number n) {
      v = n.intValue();
    } else {
      return ValidationResult.fail("Unsupported envelope version: " + version);
    }
    if (v != Redaction.ENVELOPE_VERSION) {
      return ValidationResult.fail("Unsupported envelope version: " + v);
    }
    if (!(map.get("samples") instanceof List<?>)) {
      return ValidationResult.fail("samples must be an array");
    }
    return ValidationResult.success();
  }

  /** Classify auth from request headers (pre-redaction). */
  public static String observeAuth(Map<String, String> headers) {
    if (headers == null) {
      return "none";
    }
    for (Map.Entry<String, String> e : headers.entrySet()) {
      if (e.getKey() != null
          && e.getKey().equalsIgnoreCase("authorization")
          && e.getValue() != null
          && RE_BEARER.matcher(e.getValue()).find()) {
        return "bearer";
      }
    }
    for (Map.Entry<String, String> e : headers.entrySet()) {
      if (e.getKey() != null && e.getKey().equalsIgnoreCase("cookie")) {
        return "cookie";
      }
    }
    return "none";
  }

  /** Build SF3 caller hints. Explicit service name / X-Service-Name preferred. */
  public static Map<String, Object> resolveCaller(Map<String, String> headers, String serviceName) {
    Map<String, String> lower = new LinkedHashMap<>();
    if (headers != null) {
      for (Map.Entry<String, String> e : headers.entrySet()) {
        if (e.getKey() != null) {
          lower.put(e.getKey().toLowerCase(Locale.ROOT), e.getValue());
        }
      }
    }
    String explicit = firstNonEmpty(
        lower.get("x-service-name"),
        lower.get("x-client-name"),
        serviceName);
    String ua = String.valueOf(lower.getOrDefault("user-agent", "")).toLowerCase(Locale.ROOT);
    String family;
    if (ua.contains("curl/") || "curl".equals(ua)) {
      family = "curl";
    } else if (ua.contains("mozilla/")
        || ua.contains("chrome/")
        || ua.contains("safari/")
        || ua.contains("firefox/")
        || ua.contains("edg/")) {
      family = "browser";
    } else if (ua.contains("axios")
        || ua.contains("node-fetch")
        || ua.contains("go-http")
        || ua.contains("python-requests")
        || ua.contains("okhttp")
        || ua.contains("java/")
        || ua.contains("apiglimpse")) {
      family = "sdk";
    } else {
      family = "unknown";
    }

    Map<String, Object> out = new LinkedHashMap<>();
    if (explicit != null && !explicit.isBlank()) {
      out.put("key", "svc:" + explicit.toLowerCase(Locale.ROOT));
      out.put("label", explicit);
      out.put("serviceName", explicit);
      out.put("userAgentFamily", family);
    } else {
      out.put("key", "ua:" + family);
      out.put("label", "ua:" + family);
      out.put("serviceName", null);
      out.put("userAgentFamily", family);
    }
    return out;
  }

  private static String contentType(Map<String, String> headers) {
    for (Map.Entry<String, String> e : headers.entrySet()) {
      if (e.getKey() != null && e.getKey().equalsIgnoreCase("content-type") && e.getValue() != null) {
        String ct = e.getValue().split(";", 2)[0].trim();
        return ct.isEmpty() ? null : ct;
      }
    }
    return null;
  }

  private static List<String> headerNames(Map<String, String> headers) {
    List<String> names = new ArrayList<>(headers.size());
    for (String k : headers.keySet()) {
      names.add(k.toLowerCase(Locale.ROOT));
    }
    return names;
  }

  private static List<String> lowerNames(List<String> names) {
    List<String> out = new ArrayList<>(names.size());
    for (String n : names) {
      out.add(n == null ? "" : n.toLowerCase(Locale.ROOT));
    }
    return out;
  }

  private static String firstNonEmpty(String... vals) {
    if (vals == null) {
      return null;
    }
    for (String v : vals) {
      if (v != null && !v.isBlank()) {
        return v.trim();
      }
    }
    return null;
  }

  /** Mutable builder input for {@link #createSample(SampleInput)}. */
  public static final class SampleInput {
    public String method;
    public String path;
    public int statusCode;
    public long latencyMs;
    public Map<String, String> requestHeaders;
    public Map<String, String> responseHeaders;
    public List<String> requestHeaderNames;
    public List<String> responseHeaderNames;
    public Object requestBody;
    public Object responseBody;
    public boolean hasRequestBody;
    public boolean hasResponseBody;
    public Boolean responseBodyCaptured;
    public Object caller;
    public String authObserved;
    public String timestamp;
  }

  public record ValidationResult(boolean ok, String error) {
    public static ValidationResult success() {
      return new ValidationResult(true, null);
    }

    public static ValidationResult fail(String error) {
      return new ValidationResult(false, error);
    }
  }
}
