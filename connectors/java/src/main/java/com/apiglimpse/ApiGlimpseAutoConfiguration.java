package com.apiglimpse;

import jakarta.annotation.PreDestroy;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;

/**
 * Auto-configures the API Glimpse Servlet filter when on a Servlet web application.
 */
@AutoConfiguration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnClass(name = "jakarta.servlet.Filter")
@ConditionalOnProperty(prefix = "apiglimpse", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(ApiGlimpseProperties.class)
public class ApiGlimpseAutoConfiguration {

  @Bean
  @ConditionalOnMissingBean
  public ApiGlimpseClient apiGlimpseClient(ApiGlimpseProperties properties) {
    ApiGlimpseClient client = new ApiGlimpseClient(properties);
    client.start();
    return client;
  }

  @Bean
  @ConditionalOnMissingBean
  public ApiGlimpseFilter apiGlimpseFilter(ApiGlimpseProperties properties, ApiGlimpseClient client) {
    return new ApiGlimpseFilter(properties, client);
  }

  @Bean
  public FilterRegistrationBean<ApiGlimpseFilter> apiGlimpseFilterRegistration(ApiGlimpseFilter filter) {
    FilterRegistrationBean<ApiGlimpseFilter> reg = new FilterRegistrationBean<>();
    reg.setFilter(filter);
    reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 20);
    reg.addUrlPatterns("/*");
    reg.setName("apiGlimpseFilter");
    return reg;
  }

  @Bean
  public ApiGlimpseShutdownHook apiGlimpseShutdownHook(ApiGlimpseClient client) {
    return new ApiGlimpseShutdownHook(client);
  }

  static final class ApiGlimpseShutdownHook {
    private final ApiGlimpseClient client;

    ApiGlimpseShutdownHook(ApiGlimpseClient client) {
      this.client = client;
    }

    @PreDestroy
    void shutdown() {
      client.close();
    }
  }
}
