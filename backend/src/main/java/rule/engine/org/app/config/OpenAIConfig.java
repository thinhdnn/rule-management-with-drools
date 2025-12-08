package rule.engine.org.app.config;

import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Configuration for AI API integration (OpenAI or OpenRouter).
 * Loads properties from application.yml and creates AI client bean.
 */
@Configuration
@ConfigurationProperties(prefix = "ai")
@Data
public class OpenAIConfig {
    
    private String apiKey;
    private String provider = "openrouter"; // "openai" or "openrouter"
    private String baseUrl; // Optional, defaults based on provider
    private String model = "openai/gpt-oss-120b:free"; // OpenRouter format: "openai/gpt-4o" or "anthropic/claude-3.5-sonnet"
    private Double temperature = 0.2;
    private Integer maxTokens = 2000;
    private Integer timeout = 30;
    private Boolean enabled = true;
    private String httpReferer; // For OpenRouter
    private String httpTitle; // For OpenRouter
    
    /**
     * Create AI client bean if API key is configured and AI features are enabled
     */
    @Bean
    @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(
        prefix = "ai",
        name = "enabled",
        havingValue = "true"
    )
    public OpenAIClient openAIClient() {
        if (apiKey == null || apiKey.trim().isEmpty()) {
            throw new IllegalStateException(
                "AI API key is not configured. " +
                "Set AI_API_KEY environment variable to use AI features."
            );
        }
        
        // Set base URL based on provider
        String baseUrlToUse = baseUrl;
        if (baseUrlToUse == null || baseUrlToUse.trim().isEmpty()) {
            if ("openrouter".equalsIgnoreCase(provider)) {
                baseUrlToUse = "https://openrouter.ai/api/v1";
            } else {
                baseUrlToUse = "https://api.openai.com/v1";
            }
        }
        
        // Build OpenAI client with custom base URL
        // Note: OpenRouter headers (HTTP-Referer, X-Title) are optional and can be set via environment variables
        // The OpenAI SDK will use the baseUrl for all API calls
        return OpenAIOkHttpClient.builder()
            .apiKey(apiKey)
            .baseUrl(baseUrlToUse)
            .timeout(Duration.ofSeconds(timeout))
            .build();
    }
}

