using System.Text.Json.Serialization;

namespace ApiGlimpse.AspNetCore;

/// <summary>One traffic observation in envelope v1.</summary>
public sealed class Sample
{
    [JsonPropertyName("method")]
    public string Method { get; set; } = "GET";

    [JsonPropertyName("path")]
    public string Path { get; set; } = "/";

    [JsonPropertyName("statusCode")]
    public int StatusCode { get; set; }

    [JsonPropertyName("latencyMs")]
    public long LatencyMs { get; set; }

    [JsonPropertyName("authObserved")]
    public string AuthObserved { get; set; } = "none";

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = string.Empty;

    [JsonPropertyName("responseBodyCaptured")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? ResponseBodyCaptured { get; set; }

    [JsonPropertyName("caller")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public object? Caller { get; set; }

    [JsonPropertyName("request")]
    public IoSide Request { get; set; } = new();

    [JsonPropertyName("response")]
    public IoSide Response { get; set; } = new();
}

/// <summary>Request or response half of a sample.</summary>
public sealed class IoSide
{
    [JsonPropertyName("contentType")]
    public string? ContentType { get; set; }

    [JsonPropertyName("headerNames")]
    public List<string> HeaderNames { get; set; } = new();

    [JsonPropertyName("headers")]
    public Dictionary<string, string> Headers { get; set; } = new();

    [JsonPropertyName("bodyShape")]
    public object? BodyShape { get; set; }
}

/// <summary>POST /v1/samples body (version 1).</summary>
public sealed class Envelope
{
    [JsonPropertyName("version")]
    public int Version { get; set; } = Redaction.EnvelopeVersion;

    [JsonPropertyName("apiKey")]
    public string ApiKey { get; set; } = string.Empty;

    [JsonPropertyName("samples")]
    public List<Sample> Samples { get; set; } = new();

    [JsonPropertyName("sentAt")]
    public string SentAt { get; set; } = string.Empty;
}

/// <summary>Capture-time input for <see cref="EnvelopeFactory.CreateSample"/>.</summary>
public sealed class SampleInput
{
    public string Method { get; set; } = "GET";
    public string Path { get; set; } = "/";
    public int StatusCode { get; set; }
    public long LatencyMs { get; set; }
    public IDictionary<string, string>? RequestHeaders { get; set; }
    public IDictionary<string, string>? ResponseHeaders { get; set; }
    public IReadOnlyList<string>? RequestHeaderNames { get; set; }
    public IReadOnlyList<string>? ResponseHeaderNames { get; set; }
    public object? RequestBody { get; set; }
    public object? ResponseBody { get; set; }
    public bool HasRequestBody { get; set; }
    public bool HasResponseBody { get; set; }
    public bool? ResponseBodyCaptured { get; set; }
    public object? Caller { get; set; }
    public string? AuthObserved { get; set; }
    public string? Timestamp { get; set; }
}

/// <summary>Builders for envelope v1 samples.</summary>
public static class EnvelopeFactory
{
    public static Sample CreateSample(SampleInput input)
    {
        var ts = string.IsNullOrEmpty(input.Timestamp)
            ? DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")
            : input.Timestamp!;
        var auth = string.IsNullOrEmpty(input.AuthObserved) ? "none" : input.AuthObserved!;
        var method = string.IsNullOrEmpty(input.Method) ? "GET" : input.Method.ToUpperInvariant();
        var path = string.IsNullOrEmpty(input.Path) ? "/" : input.Path;

        var reqHeaders = input.RequestHeaders ?? new Dictionary<string, string>();
        var resHeaders = input.ResponseHeaders ?? new Dictionary<string, string>();

        var reqNames = input.RequestHeaderNames is { Count: > 0 }
            ? input.RequestHeaderNames.Select(n => n.ToLowerInvariant()).ToList()
            : reqHeaders.Keys.Select(k => k.ToLowerInvariant()).ToList();
        var resNames = input.ResponseHeaderNames is { Count: > 0 }
            ? input.ResponseHeaderNames.Select(n => n.ToLowerInvariant()).ToList()
            : resHeaders.Keys.Select(k => k.ToLowerInvariant()).ToList();

        object? reqShape = input.HasRequestBody ? Redaction.ShapeBody(input.RequestBody) : null;
        object? resShape = input.HasResponseBody ? Redaction.ShapeBody(input.ResponseBody) : null;

        return new Sample
        {
            Method = method,
            Path = path,
            StatusCode = input.StatusCode,
            LatencyMs = input.LatencyMs,
            AuthObserved = auth,
            Timestamp = ts,
            ResponseBodyCaptured = input.ResponseBodyCaptured,
            Caller = input.Caller,
            Request = new IoSide
            {
                ContentType = ContentType(reqHeaders),
                HeaderNames = reqNames,
                Headers = Redaction.RedactHeaders(reqHeaders),
                BodyShape = reqShape,
            },
            Response = new IoSide
            {
                ContentType = ContentType(resHeaders),
                HeaderNames = resNames,
                Headers = Redaction.RedactHeaders(resHeaders),
                BodyShape = resShape,
            },
        };
    }

    public static Envelope CreateEnvelope(string apiKey, IEnumerable<Sample>? samples)
    {
        return new Envelope
        {
            Version = Redaction.EnvelopeVersion,
            ApiKey = apiKey,
            Samples = samples?.ToList() ?? new List<Sample>(),
            SentAt = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'"),
        };
    }

    public static (bool Ok, string? Error) ValidateEnvelope(Envelope? env)
    {
        if (env is null) return (false, "Body must be an object");
        if (env.Version != Redaction.EnvelopeVersion) return (false, "Unsupported envelope version");
        if (env.Samples is null) return (false, "samples must be an array");
        return (true, null);
    }

    /// <summary>Classify auth from request headers (pre-redaction).</summary>
    public static string ObserveAuth(IDictionary<string, string>? headers)
    {
        if (headers is null) return "none";
        foreach (var (k, v) in headers)
        {
            if (k.Equals("authorization", StringComparison.OrdinalIgnoreCase)
                && System.Text.RegularExpressions.Regex.IsMatch(v, @"^Bearer\s+", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                return "bearer";
            }
        }
        foreach (var k in headers.Keys)
        {
            if (k.Equals("cookie", StringComparison.OrdinalIgnoreCase)) return "cookie";
        }
        return "none";
    }

    /// <summary>Build SF3 caller hints. Explicit service name / X-Service-Name preferred.</summary>
    public static Dictionary<string, object?> ResolveCaller(IDictionary<string, string>? headers, string? serviceName)
    {
        var lower = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (headers is not null)
        {
            foreach (var (k, v) in headers) lower[k.ToLowerInvariant()] = v;
        }

        lower.TryGetValue("x-service-name", out var xSvc);
        lower.TryGetValue("x-client-name", out var xClient);
        var explicitName = FirstNonEmpty(xSvc, xClient, serviceName);
        lower.TryGetValue("user-agent", out var uaRaw);
        var ua = (uaRaw ?? string.Empty).ToLowerInvariant();

        var family = "unknown";
        if (ua.Contains("curl/", StringComparison.Ordinal) || ua == "curl")
            family = "curl";
        else if (ua.Contains("mozilla/", StringComparison.Ordinal)
                 || ua.Contains("chrome/", StringComparison.Ordinal)
                 || ua.Contains("safari/", StringComparison.Ordinal)
                 || ua.Contains("firefox/", StringComparison.Ordinal)
                 || ua.Contains("edg/", StringComparison.Ordinal))
            family = "browser";
        else if (ua.Contains("axios", StringComparison.Ordinal)
                 || ua.Contains("node-fetch", StringComparison.Ordinal)
                 || ua.Contains("go-http", StringComparison.Ordinal)
                 || ua.Contains("python-requests", StringComparison.Ordinal)
                 || ua.Contains("okhttp", StringComparison.Ordinal)
                 || ua.Contains("java/", StringComparison.Ordinal)
                 || ua.Contains("apiglimpse", StringComparison.Ordinal))
            family = "sdk";

        if (!string.IsNullOrEmpty(explicitName))
        {
            return new Dictionary<string, object?>
            {
                ["key"] = "svc:" + explicitName.ToLowerInvariant(),
                ["label"] = explicitName,
                ["serviceName"] = explicitName,
                ["userAgentFamily"] = family,
            };
        }

        return new Dictionary<string, object?>
        {
            ["key"] = "ua:" + family,
            ["label"] = "ua:" + family,
            ["serviceName"] = null,
            ["userAgentFamily"] = family,
        };
    }

    private static string? ContentType(IDictionary<string, string> headers)
    {
        foreach (var (k, v) in headers)
        {
            if (k.Equals("content-type", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(v))
            {
                return v.Split(';')[0].Trim();
            }
        }
        return null;
    }

    private static string? FirstNonEmpty(params string?[] vals)
    {
        foreach (var v in vals)
        {
            if (!string.IsNullOrWhiteSpace(v)) return v.Trim();
        }
        return null;
    }
}
