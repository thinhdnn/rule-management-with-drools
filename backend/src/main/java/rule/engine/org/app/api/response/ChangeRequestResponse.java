package rule.engine.org.app.api.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * DTO for change request response
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ChangeRequestResponse {
    private Long id;
    private String factType;
    private String title;
    private String description;
    private String status;
    private String changesJson;
    private String approvedBy;
    private Instant approvedDate;
    private String rejectedBy;
    private Instant rejectedDate;
    private String rejectionReason;
    private Instant createdAt;
    private String createdBy;
    private String validationStatus;
    private String validationMessage;
    private String validationReleaseId;
    private Integer validationRuleCount;
    private String validationError;
    private Instant validationCheckedAt;
    private String validationResultJson;
    private String executionTestStatus;
    private String executionTestMessage;
    private Integer executionTestHitsCount;
    private java.math.BigDecimal executionTestTotalScore;
    private String executionTestFinalAction;
    private String executionTestResultJson;
}

