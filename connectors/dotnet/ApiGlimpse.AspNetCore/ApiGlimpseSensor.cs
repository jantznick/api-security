using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ApiGlimpse.AspNetCore;

/// <summary>
/// Async buffer + flush + circuit breaker for POST /v1/samples.
/// Fail-open: never throws into the request path.
/// </summary>
public sealed class ApiGlimpseSensor : IHostedService, IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = null,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly ApiGlimpseOptions _options;
    private readonly ILogger<ApiGlimpseSensor>? _logger;
    private readonly object _gate = new();
    private readonly List<Sample> _buffer = new();
    private readonly HttpClient _client;
    private readonly bool _ownsClient;
    private readonly Random _rng = new();
    private Timer? _timer;
    private bool _flushing;
    private int _failures;
    private DateTimeOffset _openUntil = DateTimeOffset.MinValue;
    private bool _disposed;

    public ApiGlimpseSensor(IOptions<ApiGlimpseOptions> options, ILogger<ApiGlimpseSensor>? logger = null)
        : this(options.Value, logger)
    {
    }

    public ApiGlimpseSensor(ApiGlimpseOptions options, ILogger<ApiGlimpseSensor>? logger = null)
    {
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _logger = logger;
        if (_options.HttpClient is not null)
        {
            _client = _options.HttpClient;
            _ownsClient = false;
        }
        else
        {
            _client = new HttpClient { Timeout = _options.RequestTimeout };
            _ownsClient = true;
        }
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _timer = new Timer(_ =>
        {
            try { Flush(); }
            catch { /* fail-open */ }
        }, null, _options.FlushInterval, _options.FlushInterval);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _timer?.Change(Timeout.Infinite, 0);
        try { Flush(); } catch { /* fail-open */ }
        return Task.CompletedTask;
    }

    public bool ShouldSample()
    {
        var rate = _options.SampleRate;
        if (rate >= 1) return true;
        if (rate <= 0) return false;
        lock (_gate) return _rng.NextDouble() < rate;
    }

    public void Enqueue(Sample sample)
    {
        lock (_gate)
        {
            if (_buffer.Count >= _options.MaxBufferSize)
            {
                _buffer.RemoveAt(0);
            }
            _buffer.Add(sample);
            if (_buffer.Count >= _options.MaxBatchSize)
            {
                // Fire-and-forget flush outside lock after unlock
                ThreadPool.QueueUserWorkItem(_ =>
                {
                    try { Flush(); } catch { /* fail-open */ }
                });
            }
        }
    }

    public void Flush()
    {
        List<Sample> batch;
        string apiKey;
        string agentUrl;
        lock (_gate)
        {
            if (_flushing || _buffer.Count == 0 || DateTimeOffset.UtcNow < _openUntil)
            {
                return;
            }
            _flushing = true;
            var n = Math.Min(_options.MaxBatchSize, _buffer.Count);
            batch = _buffer.GetRange(0, n);
            _buffer.RemoveRange(0, n);
            apiKey = _options.ApiKey;
            agentUrl = _options.AgentUrl.TrimEnd('/');
        }

        try
        {
            var env = EnvelopeFactory.CreateEnvelope(apiKey, batch);
            var json = JsonSerializer.Serialize(env, JsonOptions);
            using var content = new StringContent(json, Encoding.UTF8, "application/json");
            using var req = new HttpRequestMessage(HttpMethod.Post, agentUrl + "/v1/samples")
            {
                Content = content,
            };
            req.Headers.TryAddWithoutValidation("X-API-Key", apiKey);

            using var cts = new CancellationTokenSource(_options.RequestTimeout);
            HttpResponseMessage res;
            try
            {
                res = _client.Send(req, cts.Token);
            }
            catch (Exception ex)
            {
                _logger?.LogDebug(ex, "API Glimpse flush failed (fail-open)");
                lock (_gate) RecordFailure();
                return;
            }

            using (res)
            {
                if ((int)res.StatusCode >= 500)
                {
                    lock (_gate) RecordFailure();
                    return;
                }
                if (res.StatusCode == HttpStatusCode.Unauthorized)
                {
                    return;
                }
                lock (_gate) RecordSuccess();
            }
        }
        catch (Exception ex)
        {
            _logger?.LogDebug(ex, "API Glimpse flush error (fail-open)");
            lock (_gate) RecordFailure();
        }
        finally
        {
            lock (_gate) _flushing = false;
        }
    }

    private void RecordFailure()
    {
        _failures++;
        if (_failures >= _options.CircuitFailureThreshold)
        {
            _openUntil = DateTimeOffset.UtcNow.Add(_options.CircuitOpenFor);
            _failures = 0;
        }
    }

    private void RecordSuccess()
    {
        _failures = 0;
        _openUntil = DateTimeOffset.MinValue;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _timer?.Dispose();
        if (_ownsClient) _client.Dispose();
    }
}
