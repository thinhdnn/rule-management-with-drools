package rule.engine.org.app.domain.entity.ui;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import rule.engine.org.app.domain.entity.common.BaseAuditableEntity;

import java.util.UUID;

/**
 * RuleGuideDraft - Stores draft state for rule creation guide flow.
 * Allows users to save and resume their guide progress.
 */
@Entity
@Table(name = "rule_guide_drafts")
@Data
@EqualsAndHashCode(callSuper = true)
public class RuleGuideDraft extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "uuid")
    private UUID id;

    /**
     * User who owns this draft
     */
    @Column(name = "user_id", nullable = false, columnDefinition = "uuid")
    private UUID userId;

    /**
     * Current step in the guide flow
     */
    @Column(name = "step", nullable = false, length = 50)
    private String step; // 'method', 'build', 'validate', 'change', 'done'

    /**
     * Selected creation method
     */
    @Column(name = "method", length = 20)
    private String method; // 'manual' or 'ai', null if not selected

    /**
     * Flow state data (JSON)
     * Contains: changeRequest, validationStatus, validationMessage, changeStatus
     */
    @Column(name = "flow_state", columnDefinition = "text")
    private String flowState;

    /**
     * Manual form data (JSON)
     * Contains: ruleName, factType, conditions, output
     */
    @Column(name = "manual_form_data", columnDefinition = "text")
    private String manualFormData;

    /**
     * AI form data (JSON)
     * Contains: naturalInput, additionalContext, factType
     */
    @Column(name = "ai_form_data", columnDefinition = "text")
    private String aiFormData;

    /**
     * Saved rule ID if rule was already created
     */
    @Column(name = "saved_rule_id")
    private Long savedRuleId;
}

