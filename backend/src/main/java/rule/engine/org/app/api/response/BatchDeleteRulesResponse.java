package rule.engine.org.app.api.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Response DTO for batch delete rules
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BatchDeleteRulesResponse {
    private Boolean success;
    private Integer total;
    private Integer successful;
    private Integer failed;
    private List<RuleDeleteResult> results;
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class RuleDeleteResult {
        private Long ruleId;
        private String ruleName;
        private Boolean success;
        private String error;
        private String errorType;
    }
}

