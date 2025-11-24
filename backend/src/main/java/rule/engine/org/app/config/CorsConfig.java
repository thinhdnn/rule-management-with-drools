package rule.engine.org.app.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;
import java.util.List;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${cors.allowed-origins:}")
    private String allowedOrigins;

    /**
     * Parse allowed origins from configuration string.
     * Returns empty list if configuration is empty or blank.
     *
     * @return List of trimmed, non-empty origin patterns
     */
    private List<String> parseOrigins() {
        if (allowedOrigins == null || allowedOrigins.trim().isEmpty()) {
            return List.of();
        }
        return Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        List<String> originPatterns = parseOrigins();
        
        // Configure CORS for all paths
        registry.addMapping("/**")
                .allowedOriginPatterns(originPatterns.toArray(new String[0]))
                .allowedMethods("*")
                .allowedHeaders("*")
                .exposedHeaders("Content-Type", "Authorization", "X-Total-Count", 
                    "Access-Control-Allow-Origin", "Access-Control-Allow-Credentials")
                .allowCredentials(true)
                .maxAge(3600);
    }

    @Bean
    @Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE)
    public CorsFilter corsFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = new CorsConfiguration();
        
        // When credentials are allowed, we must use origin patterns, not exact origins
        config.setAllowCredentials(true);
        
        // Add configured origins as patterns
        // Spring's addAllowedOriginPattern supports both exact origins and patterns
        List<String> origins = parseOrigins();
        for (String origin : origins) {
            config.addAllowedOriginPattern(origin);
        }
        
        // Allow all HTTP methods
        config.addAllowedMethod("*");
        
        // Allow all headers
        config.addAllowedHeader("*");
        
        // Expose common response headers
        config.addExposedHeader("Content-Type");
        config.addExposedHeader("Authorization");
        config.addExposedHeader("X-Total-Count");
        config.addExposedHeader("Access-Control-Allow-Origin");
        config.addExposedHeader("Access-Control-Allow-Credentials");
        
        // Set max age for preflight requests (1 hour)
        config.setMaxAge(3600L);
        
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}

