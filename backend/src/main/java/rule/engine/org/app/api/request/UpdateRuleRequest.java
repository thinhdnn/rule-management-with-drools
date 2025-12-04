package rule.engine.org.app.api.request;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import rule.engine.org.app.domain.entity.ui.FactType;

import java.util.List;
import java.util.Map;

/**
 * DTO for update rule request body
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class UpdateRuleRequest {
    private String ruleName;
    private String label;
    private Integer priority;
    private String status; // DRAFT, ACTIVE, INACTIVE
    private FactType factType;
    private String description; // Optional description (not a field of DecisionRule entity)
    private ConditionsGroup conditions; // Grouped conditions with AND/OR
    private Map<String, Object> output; // Output object
    private Boolean createNewVersion; // Frontend flag (not a field of DecisionRule entity)
    private String versionNotes; // Optional version notes
}

