package rule.engine.org.app.domain.entity.ui;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import rule.engine.org.app.domain.entity.common.BaseAuditableEntity;

/**
 * Snapshot of which rules were deployed in each KieContainer version
 * This allows tracking the exact composition of rules for each deployed version
 */
@Entity
@Table(name = "rule_deployment_snapshots")
@Data
@EqualsAndHashCode(callSuper = true)
public class RuleDeploymentSnapshot extends BaseAuditableEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    /**
     * KieContainer version this snapshot belongs to
     */
    @Column(name = "container_version", nullable = false)
    private Integer containerVersion;
    
    /**
     * Fact type for this deployment
     * Uses FactTypeConverter to convert enum to value (Declaration/CargoReport) instead of enum name
     */
    @Column(name = "fact_type", nullable = false, length = 50)
    private FactType factType;
    
    /**
     * Rule ID that was deployed in this version
     */
    @Column(name = "rule_id", nullable = false)
    private Long ruleId;
    
    /**
     * Rule name (denormalized for easy querying)
     */
    @Column(name = "rule_name", nullable = false)
    private String ruleName;
    
    /**
     * Rule version number at time of deployment
     */
    @Column(name = "rule_version", nullable = false)
    private Integer ruleVersion;
    
    /**
     * Rule priority at time of deployment
     */
    @Column(name = "rule_priority")
    private Integer rulePriority;
    
    /**
     * Whether rule was active at deployment (should always be true for deployments)
     */
    @Column(name = "rule_active", nullable = false)
    private Boolean ruleActive;
    
    /**
     * DRL content snapshot (optional, for historical reference)
     */
    @Column(name = "rule_content", columnDefinition = "TEXT")
    private String ruleContent;
}

