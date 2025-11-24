package rule.engine.org.app.domain.entity.ui;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import rule.engine.org.app.domain.entity.common.BaseAuditableEntity;

import java.time.Instant;

/**
 * Entity for tracking scheduled rule deployments
 * When a change request is approved with SCHEDULED option,
 * a record is created here and executed by the scheduler
 */
@Entity
@Table(name = "scheduled_deployments")
@Data
@EqualsAndHashCode(callSuper = true)
public class ScheduledDeployment extends BaseAuditableEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    /**
     * Associated change request ID
     */
    @Column(name = "change_request_id", nullable = false)
    private Long changeRequestId;
    
    /**
     * Fact type to deploy
     * Uses FactTypeConverter (auto-applied) to store enum value instead of enum name
     */
    @Column(name = "fact_type", nullable = false, length = 50)
    private FactType factType;
    
    /**
     * Scheduled execution time
     */
    @Column(name = "scheduled_time", nullable = false)
    private Instant scheduledTime;
    
    /**
     * Deployment status
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private DeploymentStatus status = DeploymentStatus.PENDING;
    
    /**
     * Optional deployment notes
     */
    @Column(name = "deployment_notes", columnDefinition = "TEXT")
    private String deploymentNotes;
    
    /**
     * Actual execution time (when deployed)
     */
    @Column(name = "executed_at")
    private Instant executedAt;
    
    /**
     * Error message if deployment failed
     */
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
    
    /**
     * Number of retry attempts
     */
    @Column(name = "retry_count", nullable = false)
    private Integer retryCount = 0;
    
    /**
     * Maximum retry attempts before marking as failed
     */
    @Column(name = "max_retries", nullable = false)
    private Integer maxRetries = 3;
    
    public enum DeploymentStatus {
        PENDING,    // Waiting to be executed
        EXECUTING,  // Currently being executed
        COMPLETED,  // Successfully executed
        FAILED,     // Failed after max retries
        CANCELLED   // Manually cancelled
    }
}

