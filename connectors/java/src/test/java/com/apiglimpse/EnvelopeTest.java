package com.apiglimpse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class EnvelopeTest {

  private final ObjectMapper mapper = Envelope.mapper();

  @Test
  void createSampleMatchesFixture() throws Exception {
    Map<String, Object> want = loadFixture("sample-shaped.json");

    Envelope.SampleInput in = new Envelope.SampleInput();
    in.method = "POST";
    in.path = "/api/users";
    in.statusCode = 201;
    in.latencyMs = 42;
    in.requestHeaders = ordered(
        "content-type", "application/json",
        "authorization", "Bearer secret",
        "x-request-id", "req-abc-123");
    in.responseHeaders = ordered(
        "content-type", "application/json",
        "set-cookie", "sid=abc");
    in.requestHeaderNames = List.of("content-type", "authorization", "x-request-id");
    in.responseHeaderNames = List.of("content-type", "set-cookie");
    Map<String, Object> reqBody = new LinkedHashMap<>();
    reqBody.put("email", "user@example.com");
    reqBody.put("password", "s3cret");
    Map<String, Object> profile = new LinkedHashMap<>();
    profile.put("name", "Ada");
    profile.put("age", 36);
    reqBody.put("profile", profile);
    in.requestBody = reqBody;
    in.hasRequestBody = true;
    Map<String, Object> resBody = new LinkedHashMap<>();
    resBody.put("id", "usr_01");
    resBody.put("email", "user@example.com");
    resBody.put("token", "tok_live");
    in.responseBody = resBody;
    in.hasResponseBody = true;
    in.authObserved = "bearer";
    in.timestamp = "2026-01-15T12:00:00.000Z";

    assertJsonEqual(want, Envelope.createSample(in));
  }

  @Test
  void createEnvelopeMinimalFixture() throws Exception {
    Map<String, Object> want = loadFixture("envelope-v1-minimal.json");
    Map<String, Object> env =
        Envelope.createEnvelope("ask_minimal", new ArrayList<>(), "2026-01-15T12:00:00.000Z");
    assertJsonEqual(want, env);
  }

  @Test
  void createEnvelopeSampleFixture() throws Exception {
    Map<String, Object> want = loadFixture("envelope-v1-sample.json");

    Envelope.SampleInput in = new Envelope.SampleInput();
    in.method = "POST";
    in.path = "/api/users";
    in.statusCode = 201;
    in.latencyMs = 42;
    in.requestHeaders = ordered(
        "content-type", "application/json",
        "authorization", "Bearer secret",
        "x-request-id", "req-abc-123");
    in.responseHeaders = ordered(
        "content-type", "application/json",
        "set-cookie", "sid=abc");
    in.requestHeaderNames = List.of("content-type", "authorization", "x-request-id");
    in.responseHeaderNames = List.of("content-type", "set-cookie");
    Map<String, Object> reqBody = new LinkedHashMap<>();
    reqBody.put("email", "user@example.com");
    reqBody.put("password", "s3cret");
    Map<String, Object> profile = new LinkedHashMap<>();
    profile.put("name", "Ada");
    profile.put("age", 36);
    reqBody.put("profile", profile);
    in.requestBody = reqBody;
    in.hasRequestBody = true;
    Map<String, Object> resBody = new LinkedHashMap<>();
    resBody.put("id", "usr_01");
    resBody.put("email", "user@example.com");
    resBody.put("token", "tok_live");
    in.responseBody = resBody;
    in.hasResponseBody = true;
    in.authObserved = "bearer";
    in.timestamp = "2026-01-15T12:00:00.000Z";

    Map<String, Object> env = Envelope.createEnvelope(
        "ask_test_key_fixture",
        List.of(Envelope.createSample(in)),
        "2026-01-15T12:00:01.000Z");
    assertJsonEqual(want, env);
  }

  @Test
  void validateEnvelope() {
    assertTrue(Envelope.validateEnvelope(Map.of("version", 1, "samples", List.of())).ok());
    assertFalse(Envelope.validateEnvelope(Map.of("version", 2, "samples", List.of())).ok());
    assertFalse(Envelope.validateEnvelope(Map.of("version", 1)).ok());
    assertFalse(Envelope.validateEnvelope(null).ok());
  }

  @Test
  void observeAuth() {
    assertEquals("bearer", Envelope.observeAuth(Map.of("authorization", "Bearer x")));
    assertEquals("cookie", Envelope.observeAuth(Map.of("cookie", "a=b")));
    assertEquals("none", Envelope.observeAuth(Map.of()));
  }

  @Test
  void responseBodyCapturedOptional() {
    Envelope.SampleInput without = new Envelope.SampleInput();
    without.method = "GET";
    without.path = "/";
    without.statusCode = 200;
    without.latencyMs = 1;
    without.hasResponseBody = true;
    without.responseBody = Map.of("ok", true);
    Map<String, Object> sample = Envelope.createSample(without);
    assertFalse(sample.containsKey("responseBodyCaptured"));

    Envelope.SampleInput captured = new Envelope.SampleInput();
    captured.method = "GET";
    captured.path = "/";
    captured.statusCode = 200;
    captured.latencyMs = 1;
    captured.hasResponseBody = true;
    captured.responseBody = Map.of("ok", true);
    captured.responseBodyCaptured = true;
    assertEquals(true, Envelope.createSample(captured).get("responseBodyCaptured"));
  }

  private static Map<String, String> ordered(String... kv) {
    Map<String, String> m = new LinkedHashMap<>();
    for (int i = 0; i < kv.length; i += 2) {
      m.put(kv[i], kv[i + 1]);
    }
    return m;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> loadFixture(String name) throws Exception {
    try (InputStream in = getClass().getResourceAsStream("/fixtures/" + name)) {
      assertTrue(in != null, "missing fixture " + name);
      return mapper.readValue(in, Map.class);
    }
  }

  private void assertJsonEqual(Object want, Object got) throws Exception {
    Object wn = mapper.readValue(mapper.writeValueAsBytes(want), Object.class);
    Object gn = mapper.readValue(mapper.writeValueAsBytes(got), Object.class);
    assertEquals(wn, gn);
  }
}
