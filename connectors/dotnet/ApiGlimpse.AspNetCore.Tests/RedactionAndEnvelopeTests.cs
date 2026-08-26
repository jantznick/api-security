using System.Text.Json;
using System.Text.Json.Nodes;
using ApiGlimpse.AspNetCore;

namespace ApiGlimpse.AspNetCore.Tests;

public class RedactionTests
{
    [Fact]
    public void EnvelopeVersion_IsOne()
    {
        Assert.Equal(1, Redaction.EnvelopeVersion);
    }

    [Fact]
    public void RedactHeaders_RedactsSensitive()
    {
        var input = new Dictionary<string, string>
        {
            ["Content-Type"] = "application/json",
            ["Authorization"] = "Bearer secret-token",
            ["X-Request-Id"] = "req-abc-123",
            ["Cookie"] = "sid=1",
        };
        var output = Redaction.RedactHeaders(input);
        Assert.Equal("[REDACTED]", output["authorization"]);
        Assert.Equal("[REDACTED]", output["cookie"]);
        Assert.Equal("application/json", output["content-type"]);
        Assert.Equal("req-abc-123", output["x-request-id"]);
    }

    [Theory]
    [InlineData("Bearer abc", "Bearer [REDACTED]")]
    [InlineData("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature", "[REDACTED_JWT]")]
    [InlineData("ssn 123-45-6789 here", "[REDACTED_SSN]")]
    [InlineData("short", "short")]
    public void RedactValue_Patterns(string input, string want)
    {
        Assert.Equal(want, Redaction.RedactValue(input));
    }

    [Fact]
    public void ShapeBody_MatchesFixture()
    {
        var fixture = FixtureLoader.Load("sample-shaped.json");
        var reqBody = new Dictionary<string, object?>
        {
            ["email"] = "user@example.com",
            ["password"] = "s3cret",
            ["profile"] = new Dictionary<string, object?>
            {
                ["name"] = "Ada",
                ["age"] = 36,
            },
        };
        var resBody = new Dictionary<string, object?>
        {
            ["id"] = "usr_01",
            ["email"] = "user@example.com",
            ["token"] = "tok_live",
        };

        var reqShape = Redaction.ShapeBody(reqBody);
        var resShape = Redaction.ShapeBody(resBody);

        var wantReq = fixture.GetProperty("request").GetProperty("bodyShape");
        var wantRes = fixture.GetProperty("response").GetProperty("bodyShape");

        JsonAssert.Equal(wantReq, reqShape);
        JsonAssert.Equal(wantRes, resShape);
    }
}

public class EnvelopeTests
{
    [Fact]
    public void CreateSample_MatchesFixture()
    {
        var want = FixtureLoader.Load("sample-shaped.json");
        var sample = EnvelopeFactory.CreateSample(new SampleInput
        {
            Method = "POST",
            Path = "/api/users",
            StatusCode = 201,
            LatencyMs = 42,
            RequestHeaders = new Dictionary<string, string>
            {
                ["content-type"] = "application/json",
                ["authorization"] = "Bearer secret",
                ["x-request-id"] = "req-abc-123",
            },
            ResponseHeaders = new Dictionary<string, string>
            {
                ["content-type"] = "application/json",
                ["set-cookie"] = "sid=abc",
            },
            RequestHeaderNames = new[] { "content-type", "authorization", "x-request-id" },
            ResponseHeaderNames = new[] { "content-type", "set-cookie" },
            RequestBody = new Dictionary<string, object?>
            {
                ["email"] = "user@example.com",
                ["password"] = "s3cret",
                ["profile"] = new Dictionary<string, object?>
                {
                    ["name"] = "Ada",
                    ["age"] = 36,
                },
            },
            ResponseBody = new Dictionary<string, object?>
            {
                ["id"] = "usr_01",
                ["email"] = "user@example.com",
                ["token"] = "tok_live",
            },
            HasRequestBody = true,
            HasResponseBody = true,
            AuthObserved = "bearer",
            Timestamp = "2026-01-15T12:00:00.000Z",
        });

        JsonAssert.Equal(want, sample);
    }

    [Fact]
    public void CreateEnvelope_MinimalFixture()
    {
        var want = FixtureLoader.Load("envelope-v1-minimal.json");
        var env = new Envelope
        {
            Version = Redaction.EnvelopeVersion,
            ApiKey = "ask_minimal",
            Samples = new List<Sample>(),
            SentAt = "2026-01-15T12:00:00.000Z",
        };
        JsonAssert.Equal(want, env);
    }

    [Fact]
    public void CreateEnvelope_SampleFixture()
    {
        var want = FixtureLoader.Load("envelope-v1-sample.json");
        var sample = EnvelopeFactory.CreateSample(new SampleInput
        {
            Method = "POST",
            Path = "/api/users",
            StatusCode = 201,
            LatencyMs = 42,
            RequestHeaders = new Dictionary<string, string>
            {
                ["content-type"] = "application/json",
                ["authorization"] = "Bearer secret",
                ["x-request-id"] = "req-abc-123",
            },
            ResponseHeaders = new Dictionary<string, string>
            {
                ["content-type"] = "application/json",
                ["set-cookie"] = "sid=abc",
            },
            RequestHeaderNames = new[] { "content-type", "authorization", "x-request-id" },
            ResponseHeaderNames = new[] { "content-type", "set-cookie" },
            RequestBody = new Dictionary<string, object?>
            {
                ["email"] = "user@example.com",
                ["password"] = "s3cret",
                ["profile"] = new Dictionary<string, object?>
                {
                    ["name"] = "Ada",
                    ["age"] = 36,
                },
            },
            ResponseBody = new Dictionary<string, object?>
            {
                ["id"] = "usr_01",
                ["email"] = "user@example.com",
                ["token"] = "tok_live",
            },
            HasRequestBody = true,
            HasResponseBody = true,
            AuthObserved = "bearer",
            Timestamp = "2026-01-15T12:00:00.000Z",
        });
        var env = new Envelope
        {
            Version = Redaction.EnvelopeVersion,
            ApiKey = "ask_test_key_fixture",
            Samples = new List<Sample> { sample },
            SentAt = "2026-01-15T12:00:01.000Z",
        };
        JsonAssert.Equal(want, env);
    }

    [Fact]
    public void ValidateEnvelope_ChecksVersionAndSamples()
    {
        var (ok, _) = EnvelopeFactory.ValidateEnvelope(new Envelope { Version = 1, Samples = new List<Sample>() });
        Assert.True(ok);
        var (bad, _) = EnvelopeFactory.ValidateEnvelope(new Envelope { Version = 2, Samples = new List<Sample>() });
        Assert.False(bad);
    }

    [Fact]
    public void ObserveAuth_Classifies()
    {
        Assert.Equal("bearer", EnvelopeFactory.ObserveAuth(new Dictionary<string, string> { ["authorization"] = "Bearer x" }));
        Assert.Equal("cookie", EnvelopeFactory.ObserveAuth(new Dictionary<string, string> { ["cookie"] = "a=b" }));
        Assert.Equal("none", EnvelopeFactory.ObserveAuth(new Dictionary<string, string>()));
    }
}

internal static class JsonAssert
{
    public static void Equal(object want, object got)
    {
        var wantNode = ToNode(want);
        var gotNode = ToNode(got);
        Assert.True(JsonNode.DeepEquals(wantNode, gotNode),
            $"mismatch\nwant:\n{wantNode?.ToJsonString(new JsonSerializerOptions { WriteIndented = true })}\ngot:\n{gotNode?.ToJsonString(new JsonSerializerOptions { WriteIndented = true })}");
    }

    private static JsonNode? ToNode(object v)
    {
        if (v is JsonElement je)
        {
            return JsonNode.Parse(je.GetRawText());
        }
        var json = JsonSerializer.Serialize(v);
        return JsonNode.Parse(json);
    }
}

internal static class FixtureLoader
{
    public static JsonElement Load(string name)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Fixtures", name);
        if (!File.Exists(path))
        {
            // Fall back to source-relative path during some runners
            path = Path.GetFullPath(Path.Combine(
                AppContext.BaseDirectory, "..", "..", "..", "Fixtures", name));
        }
        var json = File.ReadAllText(path);
        return JsonDocument.Parse(json).RootElement.Clone();
    }
}
