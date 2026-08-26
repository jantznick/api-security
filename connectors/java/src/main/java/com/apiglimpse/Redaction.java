package com.apiglimpse;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Client-side redaction + body shaping — mirrors packages/shared/src/redaction.js.
 */
public final class Redaction {

  public static final int ENVELOPE_VERSION = 1;

  public static final Set<String> SENSITIVE_HEADER_NAMES = Set.of(
      "authorization",
      "cookie",
      "set-cookie",
      "x-api-key",
      "x-auth-token",
      "proxy-authorization"
  );

  static final int MAX_STRING = 64;
  static final int MAX_HEADER_VAL = 128;
  static final int MAX_DEPTH = 4;
  static final int MAX_KEYS = 40;
  static final int MAX_ARRAY_ITEMS = 5;

  private static final Pattern RE_BEARER = Pattern.compile("^Bearer\\s+", Pattern.CASE_INSENSITIVE);
  private static final Pattern RE_JWT =
      Pattern.compile("^eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+");
  private static final Pattern RE_SSN = Pattern.compile("\\b\\d{3}-\\d{2}-\\d{4}\\b");
  private static final Pattern RE_CARD = Pattern.compile("\\b(?:\\d[ -]*?){13,19}\\b");

  private Redaction() {}

  public static String truncateString(Object value, int max) {
    String s = value == null ? "" : String.valueOf(value);
    if (s.length() <= max) {
      return s;
    }
    return s.substring(0, max) + "…";
  }

  public static String truncateString(Object value) {
    return truncateString(value, MAX_STRING);
  }

  /**
   * Redact sensitive header values; keys are lowercased.
   */
  public static Map<String, String> redactHeaders(Map<String, ?> headers) {
    Map<String, String> out = new LinkedHashMap<>();
    if (headers == null) {
      return out;
    }
    for (Map.Entry<String, ?> entry : headers.entrySet()) {
      String key = entry.getKey() == null ? "" : entry.getKey().toLowerCase(Locale.ROOT);
      Object rawVal = entry.getValue();
      if (SENSITIVE_HEADER_NAMES.contains(key)) {
        out.put(key, "[REDACTED]");
        continue;
      }
      String val;
      if (rawVal instanceof Iterable<?> iterable) {
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        for (Object item : iterable) {
          if (!first) {
            sb.append(", ");
          }
          sb.append(item == null ? "" : String.valueOf(item));
          first = false;
        }
        val = sb.toString();
      } else if (rawVal == null) {
        val = "";
      } else if (rawVal.getClass().isArray()) {
        Object[] arr = (Object[]) rawVal;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < arr.length; i++) {
          if (i > 0) {
            sb.append(", ");
          }
          sb.append(arr[i] == null ? "" : String.valueOf(arr[i]));
        }
        val = sb.toString();
      } else {
        val = String.valueOf(rawVal);
      }
      out.put(key, truncateString(val, MAX_HEADER_VAL));
    }
    return out;
  }

  /** Best-effort value redaction for known secret-ish patterns. */
  public static Object redactValue(Object value) {
    if (!(value instanceof String s)) {
      return value;
    }
    if (RE_BEARER.matcher(s).find()) {
      return "Bearer [REDACTED]";
    }
    if (RE_JWT.matcher(s).find()) {
      return "[REDACTED_JWT]";
    }
    if (RE_SSN.matcher(s).find()) {
      return "[REDACTED_SSN]";
    }
    if (RE_CARD.matcher(s).find()) {
      return "[REDACTED_CARD]";
    }
    return truncateString(s);
  }

  static boolean isSecretKey(String key) {
    String lower = key.toLowerCase(Locale.ROOT);
    if ("cvv".equals(lower) || "cvc".equals(lower)) {
      return true;
    }
    return lower.contains("password")
        || lower.contains("secret")
        || lower.contains("token")
        || lower.contains("ssn");
  }

  /**
   * Convert a JSON-like body into a truncated shape sample (types + short values).
   * Caps: string 64 / depth 4 / keys 40 / array items 5.
   */
  @SuppressWarnings("unchecked")
  public static Map<String, Object> shapeBody(Object body) {
    return shapeBody(body, 0);
  }

  @SuppressWarnings("unchecked")
  public static Map<String, Object> shapeBody(Object body, int depth) {
    if (body == null) {
      return mapOf("type", "null");
    }
    if (depth >= MAX_DEPTH) {
      return mapOf("type", "truncated");
    }

    if (body instanceof String s) {
      return mapOf("type", "string", "sample", redactValue(s));
    }
    if (body instanceof Boolean b) {
      return mapOf("type", "boolean", "sample", b);
    }
    if (body instanceof Integer || body instanceof Long || body instanceof Short || body instanceof Byte) {
      return mapOf("type", "integer", "sample", ((Number) body).longValue());
    }
    if (body instanceof Number n) {
      double d = n.doubleValue();
      if (Double.isNaN(d) || Double.isInfinite(d)) {
        return mapOf("type", "number", "sample", null);
      }
      if (d == Math.rint(d) && !Double.isInfinite(d) && d >= Long.MIN_VALUE && d <= Long.MAX_VALUE) {
        return mapOf("type", "integer", "sample", (long) d);
      }
      return mapOf("type", "number", "sample", d);
    }

    if (body instanceof List<?> list) {
      int n = list.size();
      int limit = Math.min(n, MAX_ARRAY_ITEMS);
      List<Object> items = new ArrayList<>(limit);
      for (int i = 0; i < limit; i++) {
        items.add(shapeBody(list.get(i), depth + 1));
      }
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("type", "array");
      out.put("length", n);
      out.put("items", items);
      return out;
    }

    if (body instanceof Map<?, ?> map) {
      List<String> allKeys = new ArrayList<>(map.size());
      for (Object k : map.keySet()) {
        allKeys.add(String.valueOf(k));
      }
      List<String> keys =
          allKeys.size() > MAX_KEYS ? allKeys.subList(0, MAX_KEYS) : allKeys;
      Map<String, Object> properties = new LinkedHashMap<>();
      for (String key : keys) {
        if (isSecretKey(key)) {
          properties.put(key, mapOf("type", "string", "sample", "[REDACTED]"));
        } else {
          properties.put(key, shapeBody(map.get(key), depth + 1));
        }
      }
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("type", "object");
      out.put("properties", properties);
      out.put("truncatedKeys", map.size() > MAX_KEYS);
      return out;
    }

    return mapOf("type", "unknown");
  }

  private static Map<String, Object> mapOf(Object... kv) {
    Map<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i < kv.length; i += 2) {
      m.put(String.valueOf(kv[i]), kv[i + 1]);
    }
    return m;
  }
}
