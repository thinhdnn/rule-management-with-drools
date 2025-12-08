package rule.engine.org.app.api.request;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * DTO for batch AI generate rules request body
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BatchAIGenerateRuleRequest {
    private List<AIGenerateRuleRequest> requests;
    private String factType; // Common fact type for all requests
    private String additionalContext; // Common additional context for all requests
}

