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

class RedactionTest {

  private final ObjectMapper mapper = Envelope.mapper();

  @Test
  void envelopeVersionIsOne() {
    assertEquals(1, Redaction.ENVELOPE_VERSION);
  }

  @Test
  void sensitiveHeadersSet() {
    assertTrue(Redaction.SENSITIVE_HEADER_NAMES.contains("authorization"));
    assertTrue(Redaction.SENSITIVE_HEADER_NAMES.contains("cookie"));
    assertTrue(Redaction.SENSITIVE_HEADER_NAMES.contains("set-cookie"));
    assertTrue(Redaction.SENSITIVE_HEADER_NAMES.contains("x-api-key"));
    assertTrue(Redaction.SENSITIVE_HEADER_NAMES.contains("x-auth-token"));
    assertTrue(Redaction.SENSITIVE_HEADER_NAMES.contains("proxy-authorization"));
  }

  @Test
  void truncateString() {
    assertEquals("short", Redaction.truncateString("short"));
    String longStr = "x".repeat(100);
    String out = Redaction.truncateString(longStr, 64);
    assertTrue(out.endsWith("…"));
    assertEquals(65, out.length());
  }

  @Test
  void redactHeaders() {
    Map<String, String> headers = new LinkedHashMap<>();
    headers.put("Authorization", "Bearer secret-token");
    headers.put("Content-Type", "application/json");
    headers.put("X-Request-Id", "req-1");
    headers.put("Cookie", "session=abc");

    Map<String, String> out = Redaction.redactHeaders(headers);
    assertEquals("[REDACTED]", out.get("authorization"));
    assertEquals("[REDACTED]", out.get("cookie"));
    assertEquals("application/json", out.get("content-type"));
    assertEquals("req-1", out.get("x-request-id"));
  }

  @Test
  void redactValuePatterns() {
    assertEquals("Bearer [REDACTED]", Redaction.redactValue("Bearer abc.def"));
    assertEquals(
        "[REDACTED_JWT]",
        Redaction.redactValue("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature"));
    assertEquals("[REDACTED_SSN]", Redaction.redactValue("ssn 123-45-6789 here"));
    assertEquals("[REDACTED_CARD]", Redaction.redactValue("4111 1111 1111 1111"));
    assertEquals("hello", Redaction.redactValue("hello"));
  }

  @Test
  void shapeBodyPrimitives() {
    assertEquals("null", Redaction.shapeBody(null).get("type"));
    assertEquals("hi", Redaction.shapeBody("hi").get("sample"));
    assertEquals(true, Redaction.shapeBody(true).get("sample"));
    assertEquals("integer", Redaction.shapeBody(42).get("type"));
    assertEquals("number", Redaction.shapeBody(3.14).get("type"));
  }

  @Test
  void shapeBodySecretKeys() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("email", "user@example.com");
    body.put("password", "hunter2");
    body.put("api_token", "tok_live");
    body.put("ssn", "123-45-6789");
    body.put("cvv", "123");
    Map<String, Object> profile = new LinkedHashMap<>();
    profile.put("name", "Ada");
    profile.put("age", 36);
    body.put("profile", profile);

    Map<String, Object> shaped = Redaction.shapeBody(body);
    @SuppressWarnings("unchecked")
    Map<String, Object> props = (Map<String, Object>) shaped.get("properties");
    assertEquals("[REDACTED]", ((Map<?, ?>) props.get("password")).get("sample"));
    assertEquals("[REDACTED]", ((Map<?, ?>) props.get("api_token")).get("sample"));
    assertEquals("[REDACTED]", ((Map<?, ?>) props.get("ssn")).get("sample"));
    assertEquals("[REDACTED]", ((Map<?, ?>) props.get("cvv")).get("sample"));
    assertEquals("user@example.com", ((Map<?, ?>) props.get("email")).get("sample"));
    assertEquals(false, shaped.get("truncatedKeys"));
  }

  @Test
  void shapeBodyCaps() {
    Map<String, Object> deep = Map.of("a", Map.of("b", Map.of("c", Map.of("d", Map.of("e", "too deep")))));
    Map<String, Object> shaped = Redaction.shapeBody(deep);
    @SuppressWarnings("unchecked")
    Map<String, Object> a = (Map<String, Object>) ((Map<?, ?>) shaped.get("properties")).get("a");
    @SuppressWarnings("unchecked")
    Map<String, Object> b = (Map<String, Object>) ((Map<?, ?>) a.get("properties")).get("b");
    @SuppressWarnings("unchecked")
    Map<String, Object> c = (Map<String, Object>) ((Map<?, ?>) b.get("properties")).get("c");
    @SuppressWarnings("unchecked")
    Map<String, Object> d = (Map<String, Object>) ((Map<?, ?>) c.get("properties")).get("d");
    assertEquals("truncated", d.get("type"));

    List<Integer> many = new ArrayList<>();
    for (int i = 0; i < 10; i++) {
      many.add(i);
    }
    Map<String, Object> arr = Redaction.shapeBody(many);
    assertEquals(10, arr.get("length"));
    assertEquals(5, ((List<?>) arr.get("items")).size());

    Map<String, Object> keys = new LinkedHashMap<>();
    for (int i = 0; i < 50; i++) {
      keys.put("k" + i, i);
    }
    Map<String, Object> obj = Redaction.shapeBody(keys);
    assertEquals(40, ((Map<?, ?>) obj.get("properties")).size());
    assertEquals(true, obj.get("truncatedKeys"));
  }

  @Test
  void shapeBodyMatchesFixture() throws Exception {
    Map<String, Object> fixture = loadFixture("sample-shaped.json");
    Map<String, Object> reqBody = new LinkedHashMap<>();
    reqBody.put("email", "user@example.com");
    reqBody.put("password", "s3cret");
    Map<String, Object> profile = new LinkedHashMap<>();
    profile.put("name", "Ada");
    profile.put("age", 36);
    reqBody.put("profile", profile);

    Map<String, Object> resBody = new LinkedHashMap<>();
    resBody.put("id", "usr_01");
    resBody.put("email", "user@example.com");
    resBody.put("token", "tok_live");

    @SuppressWarnings("unchecked")
    Map<String, Object> wantReq =
        (Map<String, Object>) ((Map<?, ?>) fixture.get("request")).get("bodyShape");
    @SuppressWarnings("unchecked")
    Map<String, Object> wantRes =
        (Map<String, Object>) ((Map<?, ?>) fixture.get("response")).get("bodyShape");

    assertJsonEqual(wantReq, Redaction.shapeBody(reqBody));
    assertJsonEqual(wantRes, Redaction.shapeBody(resBody));
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
