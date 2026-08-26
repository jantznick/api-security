package com.apiglimpse;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration for the API Glimpse Spring Boot starter.
 *
 * <p>Environment variables (preferred for deploy):
 * {@code API_SENSOR_AGENT_URL}, {@code API_SENSOR_KEY},
 * {@code API_SENSOR_SAMPLE_RATE}, {@code API_SENSOR_SERVICE_NAME}.
 *
 * <p>Also bindable via {@code apiglimpse.*} properties.
 */
@ConfigurationProperties(prefix = "apiglimpse")
public class ApiGlimpseProperties {

  /** Master switch. */
  private boolean enabled = true;

  /** Collector base URL (no trailing path). Default {@code http://localhost:8080}. */
  private String agentUrl = envOr("API_SENSOR_AGENT_URL", "http://localhost:8080");

  /** Project API key ({@code ask_…}). */
  private String apiKey = envOr("API_SENSOR_KEY", "");

  /** 0–1 sample rate. */
  private double sampleRate = envDouble("API_SENSOR_SAMPLE_RATE", 1.0);

  /** Optional topology service name. */
  private String serviceName = envOr("API_SENSOR_SERVICE_NAME", "");

  private long flushIntervalMs = 1000L;
  private int maxBatchSize = 50;
  private int maxBufferSize = 500;
  private long requestTimeoutMs = 2000L;
  private int circuitFailureThreshold = 3;
  private long circuitOpenMs = 15000L;

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public String getAgentUrl() {
    return agentUrl;
  }

  public void setAgentUrl(String agentUrl) {
    this.agentUrl = agentUrl;
  }

  public String getApiKey() {
    return apiKey;
  }

  public void setApiKey(String apiKey) {
    this.apiKey = apiKey;
  }

  public double getSampleRate() {
    return sampleRate;
  }

  public void setSampleRate(double sampleRate) {
    this.sampleRate = sampleRate;
  }

  public String getServiceName() {
    return serviceName;
  }

  public void setServiceName(String serviceName) {
    this.serviceName = serviceName;
  }

  public long getFlushIntervalMs() {
    return flushIntervalMs;
  }

  public void setFlushIntervalMs(long flushIntervalMs) {
    this.flushIntervalMs = flushIntervalMs;
  }

  public int getMaxBatchSize() {
    return maxBatchSize;
  }

  public void setMaxBatchSize(int maxBatchSize) {
    this.maxBatchSize = maxBatchSize;
  }

  public int getMaxBufferSize() {
    return maxBufferSize;
  }

  public void setMaxBufferSize(int maxBufferSize) {
    this.maxBufferSize = maxBufferSize;
  }

  public long getRequestTimeoutMs() {
    return requestTimeoutMs;
  }

  public void setRequestTimeoutMs(long requestTimeoutMs) {
    this.requestTimeoutMs = requestTimeoutMs;
  }

  public int getCircuitFailureThreshold() {
    return circuitFailureThreshold;
  }

  public void setCircuitFailureThreshold(int circuitFailureThreshold) {
    this.circuitFailureThreshold = circuitFailureThreshold;
  }

  public long getCircuitOpenMs() {
    return circuitOpenMs;
  }

  public void setCircuitOpenMs(long circuitOpenMs) {
    this.circuitOpenMs = circuitOpenMs;
  }

  private static String envOr(String name, String fallback) {
    String v = System.getenv(name);
    return v == null || v.isBlank() ? fallback : v;
  }

  private static double envDouble(String name, double fallback) {
    String v = System.getenv(name);
    if (v == null || v.isBlank()) {
      return fallback;
    }
    try {
      return Double.parseDouble(v);
    } catch (NumberFormatException e) {
      return fallback;
    }
  }
}
