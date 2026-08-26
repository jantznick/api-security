package com.apiglimpse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class ApiGlimpseClientTest {

  @Test
  void flushPostsEnvelopeViaTransport() throws Exception {
    ApiGlimpseProperties props = new ApiGlimpseProperties();
    props.setApiKey("ask_test");
    props.setAgentUrl("http://localhost:9");
    props.setMaxBatchSize(10);
    props.setFlushIntervalMs(60_000);

    List<Map<String, Object>> posted = new ArrayList<>();
    AtomicInteger status = new AtomicInteger(202);

    ApiGlimpseClient client = new ApiGlimpseClient(props, envelope -> {
      posted.add(envelope);
      return status.get();
    });

    Envelope.SampleInput in = new Envelope.SampleInput();
    in.method = "GET";
    in.path = "/health";
    in.statusCode = 200;
    in.latencyMs = 1;
    client.enqueue(Envelope.createSample(in));
    client.flush();

    assertEquals(1, posted.size());
    assertEquals(1, posted.get(0).get("version"));
    assertEquals("ask_test", posted.get(0).get("apiKey"));
    assertEquals(1, ((List<?>) posted.get(0).get("samples")).size());

    client.close();
  }

  @Test
  void circuitOpensAfterConsecutiveFailures() {
    ApiGlimpseProperties props = new ApiGlimpseProperties();
    props.setCircuitFailureThreshold(2);
    props.setCircuitOpenMs(60_000);
    props.setMaxBatchSize(50); // avoid enqueue auto-flush race

    ApiGlimpseClient client = new ApiGlimpseClient(props, envelope -> {
      throw new RuntimeException("down");
    });

    Envelope.SampleInput in = new Envelope.SampleInput();
    in.method = "GET";
    in.path = "/";
    in.statusCode = 200;
    in.latencyMs = 1;

    client.enqueue(Envelope.createSample(in));
    client.flush();
    client.enqueue(Envelope.createSample(in));
    client.flush();

    assertTrue(client.isCircuitOpen());
    client.close();
  }
}
