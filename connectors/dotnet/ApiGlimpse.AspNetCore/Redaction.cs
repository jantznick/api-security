namespace ApiGlimpse.AspNetCore;

/// <summary>
/// Client-side redaction + body shaping — mirrors packages/shared/src/redaction.js.
/// </summary>
public static class Redaction
{
    public const int EnvelopeVersion = 1;

    public static readonly HashSet<string> SensitiveHeaderNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "x-auth-token",
        "proxy-authorization",
    };

    private const int MaxString = 64;
    private const int MaxHeaderVal = 128;
    private const int MaxDepth = 4;
    private const int MaxKeys = 40;
    private const int MaxArrayItems = 5;

    private static readonly System.Text.RegularExpressions.Regex ReBearer =
        new(@"^Bearer\s+", System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Compiled);

    private static readonly System.Text.RegularExpressions.Regex ReJwt =
        new(@"^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", System.Text.RegularExpressions.RegexOptions.Compiled);

    private static readonly System.Text.RegularExpressions.Regex ReSsn =
        new(@"\b\d{3}-\d{2}-\d{4}\b", System.Text.RegularExpressions.RegexOptions.Compiled);

    private static readonly System.Text.RegularExpressions.Regex ReCard =
        new(@"\b(?:\d[ -]*?){13,19}\b", System.Text.RegularExpressions.RegexOptions.Compiled);

    public static string TruncateString(string value, int max = MaxString)
    {
        if (max <= 0) max = MaxString;
        if (value.Length <= max) return value;
        return value[..max] + "…";
    }

    /// <summary>
    /// Redact sensitive header values; keys are lowercased.
    /// </summary>
    public static Dictionary<string, string> RedactHeaders(IDictionary<string, string>? headers)
    {
        var outDict = new Dictionary<string, string>(StringComparer.Ordinal);
        if (headers is null) return outDict;

        foreach (var (rawKey, rawVal) in headers)
        {
            var key = rawKey.ToLowerInvariant();
            if (SensitiveHeaderNames.Contains(key))
            {
                outDict[key] = "[REDACTED]";
                continue;
            }
            outDict[key] = TruncateString(rawVal ?? string.Empty, MaxHeaderVal);
        }
        return outDict;
    }

    /// <summary>
    /// Best-effort value redaction for known secret-ish patterns.
    /// </summary>
    public static string RedactValue(string value)
    {
        if (ReBearer.IsMatch(value)) return "Bearer [REDACTED]";
        if (ReJwt.IsMatch(value)) return "[REDACTED_JWT]";
        if (ReSsn.IsMatch(value)) return "[REDACTED_SSN]";
        if (ReCard.IsMatch(value)) return "[REDACTED_CARD]";
        return TruncateString(value);
    }

    private static bool IsSecretKey(string key)
    {
        var lower = key.ToLowerInvariant();
        if (lower is "cvv" or "cvc") return true;
        return lower.Contains("password", StringComparison.Ordinal)
            || lower.Contains("secret", StringComparison.Ordinal)
            || lower.Contains("token", StringComparison.Ordinal)
            || lower.Contains("ssn", StringComparison.Ordinal);
    }

    /// <summary>
    /// Convert a JSON-like value into a truncated shape sample.
    /// Caps match JS: string 64 / depth 4 / keys 40 / array items 5.
    /// </summary>
    public static Dictionary<string, object?> ShapeBody(object? body, int depth = 0)
    {
        if (body is null)
        {
            return new Dictionary<string, object?> { ["type"] = "null" };
        }

        if (depth >= MaxDepth)
        {
            return new Dictionary<string, object?> { ["type"] = "truncated" };
        }

        switch (body)
        {
            case string s:
                return new Dictionary<string, object?>
                {
                    ["type"] = "string",
                    ["sample"] = RedactValue(s),
                };
            case bool b:
                return new Dictionary<string, object?>
                {
                    ["type"] = "boolean",
                    ["sample"] = b,
                };
            case byte or sbyte or short or ushort or int or uint or long or ulong:
                return new Dictionary<string, object?>
                {
                    ["type"] = "integer",
                    ["sample"] = Convert.ToInt64(body),
                };
            case float or double or decimal:
            {
                var d = Convert.ToDouble(body);
                if (double.IsNaN(d) || double.IsInfinity(d))
                {
                    return new Dictionary<string, object?>
                    {
                        ["type"] = "number",
                        ["sample"] = null,
                    };
                }
                if (Math.Abs(d - Math.Truncate(d)) < double.Epsilon
                    && d >= long.MinValue && d <= long.MaxValue)
                {
                    return new Dictionary<string, object?>
                    {
                        ["type"] = "integer",
                        ["sample"] = (long)d,
                    };
                }
                return new Dictionary<string, object?>
                {
                    ["type"] = "number",
                    ["sample"] = d,
                };
            }
            case System.Text.Json.JsonElement je:
                return ShapeJsonElement(je, depth);
            case IDictionary<string, object?> dict:
                return ShapeObject(dict, depth);
            case System.Collections.IDictionary idict:
            {
                var mapped = new Dictionary<string, object?>();
                foreach (System.Collections.DictionaryEntry entry in idict)
                {
                    mapped[Convert.ToString(entry.Key) ?? string.Empty] = entry.Value;
                }
                return ShapeObject(mapped, depth);
            }
            case System.Collections.IEnumerable enumerable when body is not string:
            {
                var list = new List<object?>();
                foreach (var item in enumerable) list.Add(item);
                var limit = Math.Min(list.Count, MaxArrayItems);
                var items = new List<object?>(limit);
                for (var i = 0; i < limit; i++)
                {
                    items.Add(ShapeBody(list[i], depth + 1));
                }
                return new Dictionary<string, object?>
                {
                    ["type"] = "array",
                    ["length"] = list.Count,
                    ["items"] = items,
                };
            }
            default:
                return new Dictionary<string, object?> { ["type"] = "unknown" };
        }
    }

    private static Dictionary<string, object?> ShapeObject(IDictionary<string, object?> body, int depth)
    {
        var keys = body.Keys.Take(MaxKeys).ToList();
        var properties = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var key in keys)
        {
            if (IsSecretKey(key))
            {
                properties[key] = new Dictionary<string, object?>
                {
                    ["type"] = "string",
                    ["sample"] = "[REDACTED]",
                };
            }
            else
            {
                properties[key] = ShapeBody(body[key], depth + 1);
            }
        }
        return new Dictionary<string, object?>
        {
            ["type"] = "object",
            ["properties"] = properties,
            ["truncatedKeys"] = body.Count > MaxKeys,
        };
    }

    private static Dictionary<string, object?> ShapeJsonElement(System.Text.Json.JsonElement je, int depth)
    {
        return je.ValueKind switch
        {
            System.Text.Json.JsonValueKind.Null => new Dictionary<string, object?> { ["type"] = "null" },
            System.Text.Json.JsonValueKind.String => ShapeBody(je.GetString(), depth),
            System.Text.Json.JsonValueKind.True => ShapeBody(true, depth),
            System.Text.Json.JsonValueKind.False => ShapeBody(false, depth),
            System.Text.Json.JsonValueKind.Number => ShapeBody(
                je.TryGetInt64(out var i) ? i : je.GetDouble(), depth),
            System.Text.Json.JsonValueKind.Array => ShapeBody(
                je.EnumerateArray().Select(e => (object?)e).ToList(), depth),
            System.Text.Json.JsonValueKind.Object => ShapeObject(
                je.EnumerateObject().ToDictionary(p => p.Name, p => (object?)p.Value), depth),
            _ => new Dictionary<string, object?> { ["type"] = "unknown" },
        };
    }
}
