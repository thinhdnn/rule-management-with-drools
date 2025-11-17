package rule.engine.org.app.config;

import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Configuration for OpenAI API integration.
 * Loads properties from application.yml and creates OpenAI client bean.
 */
@Configuration
@ConfigurationProperties(prefix = "openai")
@Data
public class OpenAIConfig {
    
    private String apiKey;
    private String model = "gpt-4o";
    private Double temperature = 0.2;
    private Integer maxTokens = 2000;
    private Integer timeout = 30;
    private Boolean enabled = true;
    
    /**
     * Create OpenAI client bean if API key is configured and AI features are enabled
     */
    @Bean
    @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(
        prefix = "openai",
        name = "enabled",
        havingValue = "true"
    )
    public OpenAIClient openAIClient() {
        if (apiKey == null || apiKey.trim().isEmpty()) {
            throw new IllegalStateException(
                "OpenAI API key is not configured. " +
                "Set OPENAI_API_KEY environment variable to use AI features."
            );
        }
        
        return OpenAIOkHttpClient.builder()
            .apiKey(apiKey)
            .timeout(Duration.ofSeconds(timeout))
            .build();
    }
}

