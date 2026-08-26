namespace ApiGlimpse.AspNetCore;

/// <summary>
/// Configuration for the API Glimpse ASP.NET Core middleware.
/// Bound from <c>ApiGlimpse</c> / env <c>API_SENSOR_*</c>.
/// </summary>
public sealed class ApiGlimpseOptions
{
    public const string SectionName = "ApiGlimpse";

    /// <summary>Collector base URL (e.g. https://collect.apiglimpse.com).</summary>
    public string AgentUrl { get; set; } = "http://localhost:8080";

    /// <summary>Project API key (ask_…).</summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>Optional topology caller label (API_SENSOR_SERVICE_NAME).</summary>
    public string? ServiceName { get; set; }

    /// <summary>Sample rate 0–1 (default 1.0).</summary>
    public double SampleRate { get; set; } = 1.0;

    public TimeSpan FlushInterval { get; set; } = TimeSpan.FromSeconds(1);
    public int MaxBatchSize { get; set; } = 50;
    public int MaxBufferSize { get; set; } = 500;
    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromSeconds(2);
    public int CircuitFailureThreshold { get; set; } = 3;
    public TimeSpan CircuitOpenFor { get; set; } = TimeSpan.FromSeconds(15);

    /// <summary>Optional HttpClient override (tests).</summary>
    public HttpClient? HttpClient { get; set; }

    /// <summary>Build options from API_SENSOR_* environment variables.</summary>
    public static ApiGlimpseOptions FromEnvironment()
    {
        var cfg = new ApiGlimpseOptions();
        var agent = Environment.GetEnvironmentVariable("API_SENSOR_AGENT_URL");
        if (!string.IsNullOrWhiteSpace(agent)) cfg.AgentUrl = agent;

        var key = Environment.GetEnvironmentVariable("API_SENSOR_KEY");
        if (!string.IsNullOrWhiteSpace(key)) cfg.ApiKey = key;

        var svc = Environment.GetEnvironmentVariable("API_SENSOR_SERVICE_NAME");
        if (!string.IsNullOrWhiteSpace(svc)) cfg.ServiceName = svc;

        var rate = Environment.GetEnvironmentVariable("API_SENSOR_SAMPLE_RATE");
        if (!string.IsNullOrWhiteSpace(rate) && double.TryParse(rate, out var r))
            cfg.SampleRate = r;

        return cfg;
    }

    /// <summary>Merge environment overrides onto an existing options instance.</summary>
    public void ApplyEnvironmentOverrides()
    {
        var env = FromEnvironment();
        // Only override when env vars are actually set
        if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("API_SENSOR_AGENT_URL")))
            AgentUrl = env.AgentUrl;
        if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("API_SENSOR_KEY")))
            ApiKey = env.ApiKey;
        if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("API_SENSOR_SERVICE_NAME")))
            ServiceName = env.ServiceName;
        if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("API_SENSOR_SAMPLE_RATE")))
            SampleRate = env.SampleRate;
    }
}
