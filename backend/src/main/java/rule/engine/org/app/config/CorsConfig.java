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

    @Value("${cors.allowed-origins:http://localhost:3000,http://localhost,https://rule.thinhnguyen.dev}")
    private String allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // Parse allowed origins from configuration
        List<String> origins = Arrays.asList(allowedOrigins.split(","));
        
        // Build origin patterns array
        String[] originPatterns = new String[origins.size() + 2];
        originPatterns[0] = "http://localhost:*";
        originPatterns[1] = "https://localhost:*";
        
        int index = 2;
        for (String origin : origins) {
            origin = origin.trim();
            if (!origin.isEmpty()) {
                originPatterns[index++] = origin;
            }
        }
        
        // Resize array if needed
        if (index < originPatterns.length) {
            String[] trimmed = new String[index];
            System.arraycopy(originPatterns, 0, trimmed, 0, index);
            originPatterns = trimmed;
        }
        
        // Configure CORS for all paths
        registry.addMapping("/**")
                .allowedOriginPatterns(originPatterns)
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
        
        // Parse allowed origins from configuration
        List<String> origins = Arrays.asList(allowedOrigins.split(","));
        
        // When credentials are allowed, we must use origin patterns, not exact origins
        config.setAllowCredentials(true);
        
        // Add specific origin patterns for development and production
        // Allow localhost with any port for development
        config.addAllowedOriginPattern("http://localhost:*");
        config.addAllowedOriginPattern("https://localhost:*");
        
        // Add configured origins as patterns
        // Spring's addAllowedOriginPattern supports both exact origins and patterns
        for (String origin : origins) {
            origin = origin.trim();
            if (!origin.isEmpty()) {
                config.addAllowedOriginPattern(origin);
            }
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

