package rule.engine.org.app.api.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import rule.engine.org.app.api.request.CreateRuleRequest;

import java.util.List;

/**
 * Response DTO for AI-powered rule generation.
 * Contains the generated rule and validation status.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AIGenerateRuleResponse {
    
    /**
     * Whether the generation was successful
     */
    private Boolean success;
    
    /**
     * Generated rule in structured format (ready to be saved)
     */
    private CreateRuleRequest generatedRule;
    
    /**
     * AI's explanation of how it interpreted the natural language input
     */
    private String aiExplanation;
    
    /**
     * Validation status of generated rule
     */
    private ValidationStatus validation;
    
    /**
     * If previewOnly=false and rule was saved, contains the saved rule ID
     */
    private Long savedRuleId;
    
    /**
     * Error message if generation failed
     */
    private String errorMessage;
    
    /**
     * Suggestions if the input was unclear or invalid
     */
    private List<String> suggestions;
    
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ValidationStatus {
        /**
         * Whether the generated rule is valid
         */
        private Boolean valid;
        
        /**
         * List of validation errors (field not found, invalid operator, etc.)
         */
        private List<String> errors;
        
        /**
         * List of validation warnings (non-blocking issues)
         */
        private List<String> warnings;
        
        /**
         * Fields that were auto-corrected or inferred by AI
         */
        private List<String> autoCorrected;
    }
}

