using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ApiGlimpse.AspNetCore.Tests;

public class MiddlewareTests
{
    [Fact]
    public async Task Middleware_PostsEnvelopeToCollector()
    {
        string? gotBody = null;
        string? gotKey = null;
        string? gotPath = null;
        var posts = 0;
        var gate = new object();

        using var collector = new TestCollector((req, body) =>
        {
            lock (gate)
            {
                gotPath = req.RequestUri?.AbsolutePath;
                gotKey = req.Headers.TryGetValues("X-API-Key", out var vals) ? vals.FirstOrDefault() : null;
                gotBody = body;
                posts++;
            }
            return new HttpResponseMessage(HttpStatusCode.Accepted)
            {
                Content = new StringContent("{\"accepted\":1}", Encoding.UTF8, "application/json"),
            };
        });

        using var host = await CreateHostAsync(collector.Handler, flushMs: 50, maxBatch: 1);

        var client = host.GetTestClient();
        var content = new StringContent(
            """{"email":"a@b.co","password":"x"}""",
            Encoding.UTF8,
            "application/json");
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/users") { Content = content };
        req.Headers.TryAddWithoutValidation("Authorization", "Bearer tok");
        var res = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);

        var deadline = DateTime.UtcNow.AddSeconds(3);
        while (Volatile.Read(ref posts) == 0 && DateTime.UtcNow < deadline)
        {
            await Task.Delay(20);
        }
        Assert.True(posts > 0, "expected collector POST");
        Assert.Equal("/v1/samples", gotPath);
        Assert.Equal("ask_test", gotKey);

        using var doc = JsonDocument.Parse(gotBody!);
        var root = doc.RootElement;
        Assert.Equal(1, root.GetProperty("version").GetInt32());
        Assert.Equal("ask_test", root.GetProperty("apiKey").GetString());
        var sample = root.GetProperty("samples")[0];
        Assert.Equal("POST", sample.GetProperty("method").GetString());
        Assert.Equal("/api/users", sample.GetProperty("path").GetString());
        Assert.Equal("bearer", sample.GetProperty("authObserved").GetString());
        Assert.Equal("[REDACTED]", sample.GetProperty("request").GetProperty("headers").GetProperty("authorization").GetString());
    }

    [Fact]
    public async Task Middleware_FailOpenWhenCollectorDown()
    {
        var options = new ApiGlimpseOptions
        {
            AgentUrl = "http://127.0.0.1:1",
            ApiKey = "ask_x",
            SampleRate = 1,
            FlushInterval = TimeSpan.FromMilliseconds(30),
            RequestTimeout = TimeSpan.FromMilliseconds(50),
            MaxBatchSize = 1,
        };

        using var host = await new HostBuilder()
            .ConfigureWebHost(web =>
            {
                web.UseTestServer();
                web.ConfigureServices(services =>
                {
                    services.AddRouting();
                    services.AddApiGlimpse(options);
                });
                web.Configure(app =>
                {
                    app.UseApiGlimpse();
                    app.UseRouting();
                    app.UseEndpoints(endpoints =>
                    {
                        endpoints.MapGet("/health", async ctx =>
                        {
                            ctx.Response.ContentType = "application/json";
                            await ctx.Response.WriteAsync("""{"status":"ok"}""");
                        });
                    });
                });
            })
            .StartAsync();

        var client = host.GetTestClient();
        var res = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("""{"status":"ok"}""", await res.Content.ReadAsStringAsync());
        await Task.Delay(100);
    }

    [Fact]
    public async Task Middleware_CapturesJsonResponseShape()
    {
        string? gotBody = null;
        var posts = 0;

        using var collector = new TestCollector((_, body) =>
        {
            gotBody = body;
            Interlocked.Increment(ref posts);
            return new HttpResponseMessage(HttpStatusCode.Accepted);
        });

        using var host = await CreateHostAsync(collector.Handler, flushMs: 40, maxBatch: 1);
        var client = host.GetTestClient();
        var res = await client.GetAsync("/api/users/1");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var deadline = DateTime.UtcNow.AddSeconds(3);
        while (Volatile.Read(ref posts) == 0 && DateTime.UtcNow < deadline)
        {
            await Task.Delay(20);
        }
        Assert.True(posts > 0);

        using var doc = JsonDocument.Parse(gotBody!);
        var sample = doc.RootElement.GetProperty("samples")[0];
        Assert.True(sample.GetProperty("responseBodyCaptured").GetBoolean());
        var shape = sample.GetProperty("response").GetProperty("bodyShape");
        Assert.Equal("object", shape.GetProperty("type").GetString());
        Assert.Equal("string", shape.GetProperty("properties").GetProperty("email").GetProperty("type").GetString());
    }

    private static async Task<IHost> CreateHostAsync(HttpMessageHandler handler, int flushMs, int maxBatch)
    {
        var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(2) };
        var options = new ApiGlimpseOptions
        {
            AgentUrl = "http://collector.test",
            ApiKey = "ask_test",
            SampleRate = 1,
            FlushInterval = TimeSpan.FromMilliseconds(flushMs),
            MaxBatchSize = maxBatch,
            HttpClient = http,
        };

        return await new HostBuilder()
            .ConfigureWebHost(web =>
            {
                web.UseTestServer();
                web.ConfigureServices(services =>
                {
                    services.AddRouting();
                    services.AddApiGlimpse(options);
                });
                web.Configure(app =>
                {
                    app.UseApiGlimpse();
                    app.UseRouting();
                    app.UseEndpoints(endpoints =>
                    {
                        endpoints.MapPost("/api/users", async ctx =>
                        {
                            ctx.Response.StatusCode = StatusCodes.Status201Created;
                            ctx.Response.ContentType = "application/json";
                            await ctx.Response.WriteAsync("""{"id":"1","email":"a@b.co"}""");
                        });
                        endpoints.MapGet("/api/users/1", async ctx =>
                        {
                            ctx.Response.ContentType = "application/json";
                            await ctx.Response.WriteAsync("""{"id":"1","email":"a@b.co"}""");
                        });
                    });
                });
            })
            .StartAsync();
    }
}

internal sealed class TestCollector : IDisposable
{
    public DelegatingHandler Handler { get; }

    public TestCollector(Func<HttpRequestMessage, string, HttpResponseMessage> respond)
    {
        Handler = new CallbackHandler(respond);
    }

    public void Dispose() => Handler.Dispose();

    private sealed class CallbackHandler : DelegatingHandler
    {
        private readonly Func<HttpRequestMessage, string, HttpResponseMessage> _respond;

        public CallbackHandler(Func<HttpRequestMessage, string, HttpResponseMessage> respond)
        {
            _respond = respond;
            InnerHandler = new HttpClientHandler();
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var body = request.Content is null
                ? string.Empty
                : await request.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            return _respond(request, body);
        }

        protected override HttpResponseMessage Send(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var body = request.Content is null
                ? string.Empty
                : request.Content.ReadAsStringAsync(cancellationToken).GetAwaiter().GetResult();
            return _respond(request, body);
        }
    }
}
