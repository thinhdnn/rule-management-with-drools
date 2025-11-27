package rule.engine.org.app.api.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * DTO for rule execution results
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RuleExecutionResponse {
    private Long id;
    private String declarationId;  // Changed from Long to String (declaration identifier)
    private Long ruleId;
    private String ruleName;
    private Boolean matched;
    private String ruleAction;
    private String ruleResult;
    private BigDecimal ruleScore;
    private LocalDateTime executedAt;
    private String executionSource;  // Source of execution: API or UI
}

