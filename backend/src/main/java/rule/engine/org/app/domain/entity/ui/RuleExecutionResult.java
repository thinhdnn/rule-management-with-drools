package rule.engine.org.app.domain.entity.ui;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import rule.engine.org.app.domain.entity.common.BaseAuditableEntity;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * RuleExecutionResult - Tracks rule execution history and results.
 * 
 * Links Declaration (input data) with DecisionRule (logic) and stores:
 * - Whether the rule matched
 * - Output values (action, result, score)
 * - When it was executed
 * 
 * This enables:
 * - Audit trail: which rules fired for which declarations
 * - Reporting: declarations by action, score distribution, rule effectiveness
 * - Debugging: why did a rule fire or not fire
 */
@Entity
@Table(name = "rule_execution_results", indexes = {
    @Index(name = "idx_execution_declaration", columnList = "declaration_id"),
    @Index(name = "idx_execution_rule", columnList = "decision_rule_id"),
    @Index(name = "idx_execution_action", columnList = "rule_action"),
    @Index(name = "idx_execution_time", columnList = "executed_at")
})
@Data
@EqualsAndHashCode(callSuper = true)
public class RuleExecutionResult extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Declaration identifier (not FK, as Declaration entity is not persisted)
     * Stores the declaration identifier (e.g., declarationId field value)
     */
    @Column(name = "declaration_id", nullable = false, length = 255)
    private String declarationId;

    /**
     * Link to the rule that was executed
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "decision_rule_id", nullable = false)
    private DecisionRule decisionRule;

    /**
     * Did the rule match/fire?
     */
    @Column(name = "matched", nullable = false)
    private Boolean matched = false;

    /**
     * Rule output: action to take
     * Values: APPROVE, REJECT, FLAG, REVIEW, etc.
     */
    @Column(name = "rule_action")
    private String ruleAction;

    /**
     * Rule output: result description/message
     */
    @Column(name = "rule_result", columnDefinition = "text")
    private String ruleResult;

    /**
     * Rule output: risk score (0-100)
     */
    @Column(name = "rule_score", precision = 5, scale = 2)
    private BigDecimal ruleScore;

    /**
     * When was this rule executed
     */
    @Column(name = "executed_at", nullable = false)
    private LocalDateTime executedAt;

    /**
     * Source of rule execution: API (from system API calls) or UI (from UI test submissions)
     */
    @Column(name = "execution_source", length = 20, nullable = false)
    private String executionSource = "API";
}

