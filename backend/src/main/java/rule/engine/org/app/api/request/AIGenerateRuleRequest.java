package rule.engine.org.app.api.request;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request DTO for AI-powered rule generation.
 * Accepts natural language input and generates a structured rule.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AIGenerateRuleRequest {
    
    /**
     * Natural language description of the rule to generate.
     * Example: "Nếu tổng trọng lượng hàng hóa lớn hơn 1000kg thì cần kiểm tra"
     */
    @NotBlank(message = "Natural language input is required")
    private String naturalLanguageInput;
    
    /**
     * Fact type to generate rule for (Declaration, CargoReport, etc.)
     * Defaults to "Declaration" if not specified
     */
    @Builder.Default
    private String factType = "Declaration";
    
    /**
     * Optional: Provide additional context or constraints for rule generation
     */
    private String additionalContext;
    
    /**
     * Optional: Enable preview mode (returns generated rule without saving)
     * Default: true (preview only, don't save)
     */
    private Boolean previewOnly;
}

