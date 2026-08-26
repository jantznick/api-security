using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ApiGlimpse.AspNetCore;

/// <summary>
/// ASP.NET Core middleware that samples traffic and asynchronously POSTs envelope v1.
/// Fail-open: never blocks or fails the customer request because of API Glimpse.
/// </summary>
public sealed class ApiGlimpseMiddleware
{
    private const int MaxBodyBytes = 64 * 1024;
    private readonly RequestDelegate _next;
    private readonly ApiGlimpseSensor _sensor;
    private readonly ApiGlimpseOptions _options;
    private readonly ILogger<ApiGlimpseMiddleware>? _logger;

    public ApiGlimpseMiddleware(
        RequestDelegate next,
        ApiGlimpseSensor sensor,
        IOptions<ApiGlimpseOptions> options,
        ILogger<ApiGlimpseMiddleware>? logger = null)
    {
        _next = next;
        _sensor = sensor;
        _options = options.Value;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_sensor.ShouldSample())
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        var sw = Stopwatch.StartNew();
        byte[]? reqBody = null;
        try
        {
            reqBody = await PeekRequestBodyAsync(context.Request).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger?.LogDebug(ex, "API Glimpse request body peek failed (fail-open)");
        }

        var originalBody = context.Response.Body;
        await using var capture = new MemoryStream();
        context.Response.Body = capture;

        try
        {
            await _next(context).ConfigureAwait(false);
        }
        finally
        {
            try
            {
                capture.Position = 0;
                await capture.CopyToAsync(originalBody).ConfigureAwait(false);
                context.Response.Body = originalBody;

                sw.Stop();
                EnqueueSafe(context, reqBody, capture.ToArray(), sw.ElapsedMilliseconds);
            }
            catch (Exception ex)
            {
                context.Response.Body = originalBody;
                _logger?.LogDebug(ex, "API Glimpse capture failed (fail-open)");
            }
        }
    }

    private void EnqueueSafe(HttpContext context, byte[]? reqBody, byte[] resBody, long latencyMs)
    {
        try
        {
            var reqHeaders = FlattenHeaders(context.Request.Headers);
            var resHeaders = FlattenHeaders(context.Response.Headers);

            object? reqParsed = null;
            var hasReq = false;
            if (reqBody is { Length: > 0 })
            {
                try
                {
                    reqParsed = JsonSerializer.Deserialize<JsonElement>(reqBody);
                    hasReq = true;
                }
                catch { /* not JSON */ }
            }

            object? resParsed = null;
            var hasRes = false;
            resHeaders.TryGetValue("content-type", out var resCtRaw);
            var resCt = (resCtRaw ?? string.Empty).ToLowerInvariant();
            var skipRes = resCt.Contains("octet-stream", StringComparison.Ordinal)
                || resCt.Contains("event-stream", StringComparison.Ordinal)
                || resCt.StartsWith("image/", StringComparison.Ordinal)
                || resCt.StartsWith("audio/", StringComparison.Ordinal)
                || resCt.StartsWith("video/", StringComparison.Ordinal)
                || resCt.Contains("multipart/", StringComparison.Ordinal);

            if (!skipRes && resBody.Length > 0)
            {
                if (string.IsNullOrEmpty(resCt)
                    || resCt.Contains("application/json", StringComparison.Ordinal)
                    || resCt.Contains("+json", StringComparison.Ordinal))
                {
                    try
                    {
                        resParsed = JsonSerializer.Deserialize<JsonElement>(resBody);
                        hasRes = true;
                    }
                    catch { /* not JSON */ }
                }
            }

            var path = context.Request.Path.HasValue ? context.Request.Path.Value! : "/";
            if (string.IsNullOrEmpty(path)) path = "/";

            var sample = EnvelopeFactory.CreateSample(new SampleInput
            {
                Method = context.Request.Method,
                Path = path,
                StatusCode = context.Response.StatusCode,
                LatencyMs = latencyMs,
                RequestHeaders = reqHeaders,
                ResponseHeaders = resHeaders,
                RequestHeaderNames = reqHeaders.Keys.ToList(),
                ResponseHeaderNames = resHeaders.Keys.ToList(),
                RequestBody = reqParsed,
                ResponseBody = resParsed,
                HasRequestBody = hasReq,
                HasResponseBody = hasRes,
                ResponseBodyCaptured = hasRes,
                Caller = EnvelopeFactory.ResolveCaller(reqHeaders, _options.ServiceName),
                AuthObserved = EnvelopeFactory.ObserveAuth(reqHeaders),
            });

            _sensor.Enqueue(sample);
        }
        catch (Exception ex)
        {
            _logger?.LogDebug(ex, "API Glimpse enqueue failed (fail-open)");
        }
    }

    private static async Task<byte[]?> PeekRequestBodyAsync(HttpRequest request)
    {
        if (!request.Body.CanRead) return null;

        request.EnableBuffering();
        request.Body.Position = 0;
        using var ms = new MemoryStream();
        var buffer = new byte[8192];
        long total = 0;
        int read;
        while ((read = await request.Body.ReadAsync(buffer.AsMemory(0, buffer.Length)).ConfigureAwait(false)) > 0)
        {
            total += read;
            if (total > MaxBodyBytes)
            {
                request.Body.Position = 0;
                return null;
            }
            ms.Write(buffer, 0, read);
        }
        request.Body.Position = 0;
        return ms.ToArray();
    }

    private static Dictionary<string, string> FlattenHeaders(IHeaderDictionary headers)
    {
        var outDict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (key, values) in headers)
        {
            outDict[key.ToLowerInvariant()] = values.ToString();
        }
        return outDict;
    }
}
