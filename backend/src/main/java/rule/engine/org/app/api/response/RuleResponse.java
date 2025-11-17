package rule.engine.org.app.api.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * DTO for rule detail response (used by getRule, createRule, updateRule)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class RuleResponse {
    private Long id;
    private String ruleName;
    private String label;
    private String factType;
    private String ruleContent;
    private Integer priority;
    private String status; // DRAFT, ACTIVE, INACTIVE
    private Boolean generatedByAi;
    private String description;
    private List<Map<String, Object>> conditions;
    private Map<String, Object> output;
    
    // Versioning fields
    private Integer version;
    private Long parentRuleId;
    private Boolean isLatest;
    private String versionNotes;
    
    // Audit fields
    private Instant createdAt;
    private Instant updatedAt;
    private String createdBy;
    private String updatedBy;
}

