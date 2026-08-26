package com.apiglimpse;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Async fail-open buffer + flush + circuit breaker for POST /v1/samples.
 */
public final class ApiGlimpseClient implements AutoCloseable {

  private static final Logger log = LoggerFactory.getLogger(ApiGlimpseClient.class);

  private final ApiGlimpseProperties props;
  private final SampleTransport transport;
  private final Deque<Map<String, Object>> buffer = new ArrayDeque<>();
  private final Object lock = new Object();
  private final AtomicBoolean flushing = new AtomicBoolean(false);
  private final AtomicInteger consecutiveFailures = new AtomicInteger(0);
  private volatile long circuitOpenUntilMs = 0L;

  private final ScheduledExecutorService scheduler;
  private final ExecutorService flushExecutor;
  private final AtomicBoolean started = new AtomicBoolean(false);
  private final AtomicBoolean closed = new AtomicBoolean(false);

  public ApiGlimpseClient(ApiGlimpseProperties props) {
    this(props, new HttpSampleTransport(props));
  }

  public ApiGlimpseClient(ApiGlimpseProperties props, SampleTransport transport) {
    this.props = props;
    this.transport = transport;
    ThreadFactory tf = r -> {
      Thread t = new Thread(r, "apiglimpse-flush");
      t.setDaemon(true);
      return t;
    };
    this.scheduler = Executors.newSingleThreadScheduledExecutor(tf);
    this.flushExecutor = Executors.newSingleThreadExecutor(tf);
  }

  public void start() {
    if (!started.compareAndSet(false, true)) {
      return;
    }
    long interval = Math.max(props.getFlushIntervalMs(), 50L);
    scheduler.scheduleAtFixedRate(
        () -> {
          try {
            flushAsync();
          } catch (Exception ignored) {
            // fail-open
          }
        },
        interval,
        interval,
        TimeUnit.MILLISECONDS);
  }

  public void enqueue(Map<String, Object> sample) {
    if (sample == null || closed.get()) {
      return;
    }
    synchronized (lock) {
      while (buffer.size() >= props.getMaxBufferSize()) {
        buffer.pollFirst();
      }
      buffer.addLast(sample);
      boolean shouldFlush = buffer.size() >= props.getMaxBatchSize();
      if (shouldFlush) {
        flushAsync();
      }
    }
  }

  public void flushAsync() {
    if (closed.get()) {
      return;
    }
    flushExecutor.execute(this::flush);
  }

  void flush() {
    if (!flushing.compareAndSet(false, true)) {
      return;
    }
    try {
      if (System.currentTimeMillis() < circuitOpenUntilMs) {
        return;
      }
      List<Map<String, Object>> batch;
      synchronized (lock) {
        if (buffer.isEmpty()) {
          return;
        }
        batch = new ArrayList<>(Math.min(buffer.size(), props.getMaxBatchSize()));
        for (int i = 0; i < props.getMaxBatchSize() && !buffer.isEmpty(); i++) {
          batch.add(buffer.pollFirst());
        }
      }
      Map<String, Object> envelope = Envelope.createEnvelope(props.getApiKey(), batch);
      try {
        int status = transport.postSamples(envelope);
        if (status >= 500) {
          recordFailure();
        } else if (status == 401) {
          // bad key — drop, do not trip circuit forever
        } else {
          recordSuccess();
        }
      } catch (Exception e) {
        recordFailure();
        log.debug("API Glimpse flush failed (fail-open): {}", e.toString());
      }
    } finally {
      flushing.set(false);
    }
  }

  private void recordFailure() {
    int n = consecutiveFailures.incrementAndGet();
    if (n >= props.getCircuitFailureThreshold()) {
      circuitOpenUntilMs = System.currentTimeMillis() + props.getCircuitOpenMs();
      consecutiveFailures.set(0);
    }
  }

  private void recordSuccess() {
    consecutiveFailures.set(0);
    circuitOpenUntilMs = 0L;
  }

  /** Package-visible for tests. */
  int bufferSize() {
    synchronized (lock) {
      return buffer.size();
    }
  }

  boolean isCircuitOpen() {
    return System.currentTimeMillis() < circuitOpenUntilMs;
  }

  @Override
  public void close() {
    if (!closed.compareAndSet(false, true)) {
      return;
    }
    scheduler.shutdownNow();
    try {
      flush();
    } catch (Exception ignored) {
      // fail-open
    }
    flushExecutor.shutdownNow();
  }

  /** Pluggable transport (tests / custom HTTP). */
  public interface SampleTransport {
    /** @return HTTP status code */
    int postSamples(Map<String, Object> envelope) throws Exception;
  }

  static final class HttpSampleTransport implements SampleTransport {
    private final ApiGlimpseProperties props;
    private final com.fasterxml.jackson.databind.ObjectMapper mapper = Envelope.mapper();

    HttpSampleTransport(ApiGlimpseProperties props) {
      this.props = props;
    }

    @Override
    public int postSamples(Map<String, Object> envelope) throws Exception {
      String base = props.getAgentUrl() == null ? "" : props.getAgentUrl().replaceAll("/+$", "");
      String url = base + "/v1/samples";
      byte[] body = mapper.writeValueAsBytes(envelope);

      java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
          .connectTimeout(java.time.Duration.ofMillis(props.getRequestTimeoutMs()))
          .build();
      java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
          .uri(java.net.URI.create(url))
          .timeout(java.time.Duration.ofMillis(props.getRequestTimeoutMs()))
          .header("Content-Type", "application/json")
          .header("X-API-Key", props.getApiKey() == null ? "" : props.getApiKey())
          .POST(java.net.http.HttpRequest.BodyPublishers.ofByteArray(body))
          .build();
      java.net.http.HttpResponse<Void> res =
          client.send(request, java.net.http.HttpResponse.BodyHandlers.discarding());
      return res.statusCode();
    }
  }
}
