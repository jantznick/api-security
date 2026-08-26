using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ApiGlimpse.AspNetCore;

/// <summary>DI and pipeline registration for API Glimpse.</summary>
public static class ApiGlimpseServiceExtensions
{
    /// <summary>
    /// Register sensor + options. Reads <c>ApiGlimpse</c> config section and overlays
    /// <c>API_SENSOR_*</c> environment variables when present.
    /// </summary>
    public static IServiceCollection AddApiGlimpse(
        this IServiceCollection services,
        IConfiguration? configuration = null,
        Action<ApiGlimpseOptions>? configure = null)
    {
        services.AddOptions<ApiGlimpseOptions>();

        if (configuration is not null)
        {
            services.Configure<ApiGlimpseOptions>(configuration.GetSection(ApiGlimpseOptions.SectionName));
        }

        services.PostConfigure<ApiGlimpseOptions>(opts =>
        {
            opts.ApplyEnvironmentOverrides();
            configure?.Invoke(opts);
        });

        services.AddSingleton<ApiGlimpseSensor>();
        services.AddHostedService(sp => sp.GetRequiredService<ApiGlimpseSensor>());
        return services;
    }

    /// <summary>
    /// Register with an explicit options instance (useful in tests).
    /// </summary>
    public static IServiceCollection AddApiGlimpse(
        this IServiceCollection services,
        ApiGlimpseOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(options));
        services.AddSingleton<ApiGlimpseSensor>();
        services.AddHostedService(sp => sp.GetRequiredService<ApiGlimpseSensor>());
        return services;
    }

    /// <summary>Insert API Glimpse middleware into the pipeline (fail-open sampling).</summary>
    public static IApplicationBuilder UseApiGlimpse(this IApplicationBuilder app)
    {
        return app.UseMiddleware<ApiGlimpseMiddleware>();
    }
}
