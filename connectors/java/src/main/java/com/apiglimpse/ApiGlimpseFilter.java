package com.apiglimpse;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;
import org.springframework.web.util.ContentCachingResponseWrapper;

/**
 * Servlet {@link OncePerRequestFilter} MVP — capture method, path, status, latency,
 * headers, and JSON body shapes; enqueue for async fail-open flush.
 */
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class ApiGlimpseFilter extends OncePerRequestFilter {

  static final int MAX_BODY_BYTES = 64 * 1024;

  private final ApiGlimpseProperties props;
  private final ApiGlimpseClient client;
  private final ObjectMapper mapper;

  public ApiGlimpseFilter(ApiGlimpseProperties props, ApiGlimpseClient client) {
    this(props, client, Envelope.mapper());
  }

  public ApiGlimpseFilter(ApiGlimpseProperties props, ApiGlimpseClient client, ObjectMapper mapper) {
    this.props = props;
    this.client = client;
    this.mapper = mapper;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {

    if (!props.isEnabled() || !shouldSample()) {
      filterChain.doFilter(request, response);
      return;
    }

    long startNs = System.nanoTime();
    ContentCachingRequestWrapper reqWrap = new ContentCachingRequestWrapper(request, MAX_BODY_BYTES);
    ContentCachingResponseWrapper resWrap = new ContentCachingResponseWrapper(response);

    try {
      filterChain.doFilter(reqWrap, resWrap);
    } finally {
      try {
        capture(reqWrap, resWrap, startNs);
      } catch (Exception ignored) {
        // fail-open: never break the app
      }
      try {
        resWrap.copyBodyToResponse();
      } catch (Exception ignored) {
        // fail-open
      }
    }
  }

  private boolean shouldSample() {
    double rate = props.getSampleRate();
    if (rate >= 1.0) {
      return true;
    }
    if (rate <= 0.0) {
      return false;
    }
    return ThreadLocalRandom.current().nextDouble() < rate;
  }

  private void capture(
      ContentCachingRequestWrapper request,
      ContentCachingResponseWrapper response,
      long startNs) {
    Map<String, String> reqHeaders = flattenHeaders(request);
    Map<String, String> resHeaders = flattenResponseHeaders(response);
    List<String> reqNames = headerNameList(request);
    List<String> resNames = responseHeaderNameList(response);

    Object requestBody = null;
    boolean hasRequestBody = false;
    String reqCt = String.valueOf(reqHeaders.getOrDefault("content-type", "")).toLowerCase(Locale.ROOT);
    if (reqCt.contains("application/json") || reqCt.contains("+json")) {
      byte[] raw = request.getContentAsByteArray();
      if (raw != null && raw.length > 0 && raw.length <= MAX_BODY_BYTES) {
        Object parsed = tryParseJson(raw);
        if (parsed != null) {
          requestBody = parsed;
          hasRequestBody = true;
        }
      }
    }

    Object responseBody = null;
    boolean responseBodyCaptured = false;
    String resCt = String.valueOf(resHeaders.getOrDefault("content-type", "")).toLowerCase(Locale.ROOT);
    boolean skipRes = resCt.contains("octet-stream")
        || resCt.contains("event-stream")
        || resCt.startsWith("image/")
        || resCt.startsWith("audio/")
        || resCt.startsWith("video/")
        || resCt.contains("multipart/");
    if (!skipRes) {
      byte[] raw = response.getContentAsByteArray();
      if (raw != null && raw.length > 0 && raw.length <= MAX_BODY_BYTES) {
        if (resCt.isEmpty() || resCt.contains("application/json") || resCt.contains("+json")) {
          Object parsed = tryParseJson(raw);
          if (parsed != null) {
            responseBody = parsed;
            responseBodyCaptured = true;
          }
        }
      }
    }

    String path = request.getRequestURI();
    if (path == null || path.isBlank()) {
      path = "/";
    }

    long latencyMs = (System.nanoTime() - startNs) / 1_000_000L;

    Envelope.SampleInput in = new Envelope.SampleInput();
    in.method = request.getMethod();
    in.path = path;
    in.statusCode = response.getStatus();
    in.latencyMs = latencyMs;
    in.requestHeaders = reqHeaders;
    in.responseHeaders = resHeaders;
    in.requestHeaderNames = reqNames;
    in.responseHeaderNames = resNames;
    in.requestBody = requestBody;
    in.responseBody = responseBody;
    in.hasRequestBody = hasRequestBody;
    in.hasResponseBody = responseBodyCaptured;
    in.responseBodyCaptured = responseBodyCaptured;
    in.caller = Envelope.resolveCaller(reqHeaders, props.getServiceName());
    in.authObserved = Envelope.observeAuth(reqHeaders);

    client.enqueue(Envelope.createSample(in));
  }

  private Object tryParseJson(byte[] raw) {
    try {
      String text = new String(raw, StandardCharsets.UTF_8).trim();
      if (text.isEmpty()) {
        return null;
      }
      return mapper.readValue(text, Object.class);
    } catch (Exception e) {
      return null;
    }
  }

  private static Map<String, String> flattenHeaders(HttpServletRequest request) {
    Map<String, String> out = new LinkedHashMap<>();
    Enumeration<String> names = request.getHeaderNames();
    if (names == null) {
      return out;
    }
    while (names.hasMoreElements()) {
      String name = names.nextElement();
      Enumeration<String> values = request.getHeaders(name);
      List<String> joined = new ArrayList<>();
      if (values != null) {
        while (values.hasMoreElements()) {
          joined.add(values.nextElement());
        }
      }
      out.put(name.toLowerCase(Locale.ROOT), String.join(", ", joined));
    }
    return out;
  }

  private static Map<String, String> flattenResponseHeaders(HttpServletResponse response) {
    Map<String, String> out = new LinkedHashMap<>();
    for (String name : response.getHeaderNames()) {
      out.put(
          name.toLowerCase(Locale.ROOT),
          String.join(", ", response.getHeaders(name)));
    }
    return out;
  }

  private static List<String> headerNameList(HttpServletRequest request) {
    List<String> names = new ArrayList<>();
    Enumeration<String> e = request.getHeaderNames();
    if (e == null) {
      return names;
    }
    while (e.hasMoreElements()) {
      names.add(e.nextElement().toLowerCase(Locale.ROOT));
    }
    return names;
  }

  private static List<String> responseHeaderNameList(HttpServletResponse response) {
    List<String> names = new ArrayList<>();
    for (String name : response.getHeaderNames()) {
      names.add(name.toLowerCase(Locale.ROOT));
    }
    return names;
  }
}
