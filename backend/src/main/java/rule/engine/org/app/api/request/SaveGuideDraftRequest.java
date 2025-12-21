package rule.engine.org.app.api.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * Request DTO for saving rule guide draft.
 */
@Data
public class SaveGuideDraftRequest {

    @JsonProperty("step")
    private String step;

    @JsonProperty("method")
    private String method; // 'manual' or 'ai'

    @JsonProperty("flowState")
    private FlowState flowState;

    @JsonProperty("manualFormData")
    private ManualFormData manualFormData;

    @JsonProperty("aiFormData")
    private AIFormData aiFormData;

    @JsonProperty("savedRuleId")
    private Long savedRuleId;

    @Data
    public static class FlowState {
        @JsonProperty("changeRequest")
        private ChangeRequest changeRequest;

        @JsonProperty("validationStatus")
        private String validationStatus;

        @JsonProperty("validationMessage")
        private String validationMessage;

        @JsonProperty("changeStatus")
        private String changeStatus;

        @JsonProperty("batchResults")
        private Object batchResults;

        @JsonProperty("selectedFactTypeForExamples")
        private String selectedFactTypeForExamples;

        @Data
        public static class ChangeRequest {
            @JsonProperty("environment")
            private String environment;

            @JsonProperty("window")
            private String window;

            @JsonProperty("reviewer")
            private String reviewer;
        }
    }

    @Data
    public static class ManualFormData {
        @JsonProperty("ruleName")
        private String ruleName;

        @JsonProperty("factType")
        private String factType;

        @JsonProperty("conditions")
        private Object conditions;

        @JsonProperty("output")
        private Object output;
    }

    @Data
    public static class AIFormData {
        @JsonProperty("naturalInput")
        private String naturalInput;

        @JsonProperty("additionalContext")
        private String additionalContext;

        @JsonProperty("factType")
        private String factType;
    }
}

