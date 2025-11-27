package rule.engine.org.app.domain.entity.ui;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import rule.engine.org.app.domain.entity.common.BaseAuditableEntity;

import java.time.Instant;

/**
 * ChangeRequest - Stores change requests for rule modifications that require approval
 * Each change request is associated with a fact type and contains proposed changes
 */
@Entity
@Table(name = "change_requests")
@Data
@EqualsAndHashCode(callSuper = true)
public class ChangeRequest extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Fact type this change request applies to (e.g., "Declaration", "CargoReport")
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "fact_type", nullable = false, length = 100)
    private FactType factType = FactType.DECLARATION;

    /**
     * Title/summary of the change request
     */
    @Column(name = "title", nullable = false)
    private String title;

    /**
     * Detailed description of the proposed changes
     */
    @Column(name = "description", columnDefinition = "text")
    private String description;

    /**
     * Status of the change request: Pending, Approved, Rejected
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 50)
    private ChangeRequestStatus status = ChangeRequestStatus.PENDING;

    /**
     * JSON object containing proposed changes
     * Format: {"rulesToAdd": [ruleIds], "rulesToUpdate": [ruleIds], "rulesToDelete": [ruleIds]}
     */
    @Column(name = "changes_json", columnDefinition = "jsonb")
    @org.hibernate.annotations.ColumnTransformer(write = "?::jsonb")
    private String changesJson;

    /**
     * User who approved the change request
     */
    @Column(name = "approved_by")
    private String approvedBy;

    /**
     * Date when the change request was approved
     */
    @Column(name = "approved_date")
    private Instant approvedDate;

    /**
     * User who rejected the change request
     */
    @Column(name = "rejected_by")
    private String rejectedBy;

    /**
     * Date when the change request was rejected
     */
    @Column(name = "rejected_date")
    private Instant rejectedDate;

    /**
     * Reason for rejection if the change request was rejected
     */
    @Column(name = "rejection_reason", columnDefinition = "text")
    private String rejectionReason;

    /**
     * Last validation status (e.g., SUCCESS, FAILED)
     */
    @Column(name = "validation_status", length = 50)
    private String validationStatus;

    /**
     * Human readable validation message
     */
    @Column(name = "validation_message", columnDefinition = "text")
    private String validationMessage;

    /**
     * Release ID returned by the temporary validation build (if available)
     */
    @Column(name = "validation_release_id", length = 255)
    private String validationReleaseId;

    /**
     * Number of rules compiled during validation
     */
    @Column(name = "validation_rule_count")
    private Integer validationRuleCount;

    /**
     * Validation error payload when compilation failed
     */
    @Column(name = "validation_error", columnDefinition = "text")
    private String validationError;

    /**
     * Timestamp of the last validation attempt
     */
    @Column(name = "validation_checked_at")
    private Instant validationCheckedAt;

    /**
     * Raw validation result JSON for display purposes
     */
    @Column(name = "validation_result_json", columnDefinition = "jsonb")
    @org.hibernate.annotations.ColumnTransformer(write = "?::jsonb")
    private String validationResultJson;

    /**
     * Execution test status (e.g., PASSED, FAILED, NOT_RUN)
     */
    @Column(name = "execution_test_status", length = 50)
    private String executionTestStatus;

    /**
     * Execution test message
     */
    @Column(name = "execution_test_message", columnDefinition = "text")
    private String executionTestMessage;

    /**
     * Number of rule hits from execution test
     */
    @Column(name = "execution_test_hits_count")
    private Integer executionTestHitsCount;

    /**
     * Total score from execution test
     */
    @Column(name = "execution_test_total_score", precision = 19, scale = 2)
    private java.math.BigDecimal executionTestTotalScore;

    /**
     * Final action from execution test
     */
    @Column(name = "execution_test_final_action", length = 50)
    private String executionTestFinalAction;

    /**
     * Raw execution test result JSON for display purposes
     */
    @Column(name = "execution_test_result_json", columnDefinition = "jsonb")
    @org.hibernate.annotations.ColumnTransformer(write = "?::jsonb")
    private String executionTestResultJson;
}

