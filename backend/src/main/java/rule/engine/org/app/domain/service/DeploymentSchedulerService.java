package rule.engine.org.app.domain.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rule.engine.org.app.domain.entity.ui.DecisionRule;
import rule.engine.org.app.domain.entity.ui.ScheduledDeployment;
import rule.engine.org.app.domain.entity.ui.RuleStatus;
import rule.engine.org.app.domain.repository.DecisionRuleRepository;
import rule.engine.org.app.domain.repository.ScheduledDeploymentRepository;

import java.time.Instant;
import java.util.List;

/**
 * Service for executing scheduled rule deployments
 * Runs every minute to check for due deployments
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DeploymentSchedulerService {
    
    private final ScheduledDeploymentRepository scheduledDeploymentRepository;
    private final DecisionRuleRepository decisionRuleRepository;
    private final RuleEngineManager ruleEngineManager;
    private final rule.engine.org.app.domain.repository.ChangeRequestRepository changeRequestRepository;
    private final NotificationService notificationService;
    
    /**
     * Check for and execute scheduled deployments
     * Runs every minute
     */
    @Scheduled(cron = "0 * * * * *") // Every minute at :00 seconds
    @Transactional
    public void processScheduledDeployments() {
        log.debug("Checking for scheduled deployments...");
        
        // Find all pending deployments that are due
        List<ScheduledDeployment> dueDeployments = scheduledDeploymentRepository
            .findByStatusAndScheduledTimeLessThanEqualOrderByScheduledTimeAsc(
                ScheduledDeployment.DeploymentStatus.PENDING,
                Instant.now()
            );
        
        if (dueDeployments.isEmpty()) {
            log.debug("No scheduled deployments due at this time");
            return;
        }
        
        log.info("Found {} scheduled deployment(s) to execute", dueDeployments.size());
        
        for (ScheduledDeployment deployment : dueDeployments) {
            executeDeployment(deployment);
        }
    }
    
    /**
     * Execute a single scheduled deployment
     */
    @Transactional
    public void executeDeployment(ScheduledDeployment deployment) {
        try {
            log.info("Executing scheduled deployment {} for fact type {} (change request {})",
                deployment.getId(), 
                deployment.getFactType().getValue(),
                deployment.getChangeRequestId()
            );
            
            // Update status to EXECUTING
            deployment.setStatus(ScheduledDeployment.DeploymentStatus.EXECUTING);
            scheduledDeploymentRepository.save(deployment);
            
            // Get all active and latest rules for this fact type
            List<DecisionRule> rulesToDeploy = decisionRuleRepository
                .findByFactTypeAndStatusAndIsLatest(
                    deployment.getFactType(),
                    RuleStatus.ACTIVE,
                    true
                );
            
            log.info("Found {} active and latest rules to deploy", rulesToDeploy.size());
            
            // Validate rules before deployment
            if (rulesToDeploy.isEmpty()) {
                throw new IllegalStateException(
                    "No active and latest rules found for fact type: " + deployment.getFactType().getValue()
                );
            }
            
            // Deploy rules (rebuild KieContainer and increment version)
            ruleEngineManager.deployRules(deployment.getFactType().getValue());
            
            // Mark as completed
            deployment.setStatus(ScheduledDeployment.DeploymentStatus.COMPLETED);
            deployment.setExecutedAt(Instant.now());
            deployment.setErrorMessage(null);
            scheduledDeploymentRepository.save(deployment);
            
            log.info("Successfully executed scheduled deployment {}", deployment.getId());
            
            // Create notification for change request creator
            createDeploymentNotification(deployment, true, null);
            
        } catch (Exception e) {
            log.error("Failed to execute scheduled deployment {}: {}", 
                deployment.getId(), e.getMessage(), e);
            
            // Increment retry count
            deployment.setRetryCount(deployment.getRetryCount() + 1);
            deployment.setErrorMessage(e.getMessage());
            
            // Check if max retries exceeded
            if (deployment.getRetryCount() >= deployment.getMaxRetries()) {
                deployment.setStatus(ScheduledDeployment.DeploymentStatus.FAILED);
                log.error("Scheduled deployment {} failed after {} retries", 
                    deployment.getId(), deployment.getRetryCount());
                
                // Create notification for failed deployment
                createDeploymentNotification(deployment, false, e.getMessage());
            } else {
                // Return to PENDING for retry
                deployment.setStatus(ScheduledDeployment.DeploymentStatus.PENDING);
                log.warn("Scheduled deployment {} will be retried (attempt {}/{})", 
                    deployment.getId(), 
                    deployment.getRetryCount() + 1,
                    deployment.getMaxRetries());
            }
            
            scheduledDeploymentRepository.save(deployment);
        }
    }
    
    /**
     * Create notification for deployment completion or failure
     */
    private void createDeploymentNotification(ScheduledDeployment deployment, boolean success, String errorMessage) {
        try {
            // Get change request to find creator
            rule.engine.org.app.domain.entity.ui.ChangeRequest changeRequest = changeRequestRepository
                .findById(deployment.getChangeRequestId())
                .orElse(null);
            
            if (changeRequest == null) {
                log.warn("Change request {} not found for deployment notification", deployment.getChangeRequestId());
                return;
            }
            
            String creatorId = changeRequest.getCreatedBy();
            if (creatorId == null || creatorId.isEmpty()) {
                log.warn("Change request {} has no creator", deployment.getChangeRequestId());
                return;
            }
            
            try {
                java.util.UUID creatorUUID = java.util.UUID.fromString(creatorId);
                String actionUrl = String.format("/change-requests/%d", changeRequest.getId());
                
                if (success) {
                    String message = String.format(
                        "Scheduled deployment for change request '%s' has been completed successfully.",
                        changeRequest.getTitle());
                    
                    notificationService.createNotification(
                        creatorUUID,
                        "Deployment Completed",
                        message,
                        rule.engine.org.app.domain.entity.ui.Notification.NotificationType.SUCCESS,
                        actionUrl,
                        "View Change Request"
                    );
                } else {
                    String message = String.format(
                        "Scheduled deployment for change request '%s' has failed. Error: %s",
                        changeRequest.getTitle(),
                        errorMessage != null ? errorMessage : "Unknown error");
                    
                    notificationService.createNotification(
                        creatorUUID,
                        "Deployment Failed",
                        message,
                        rule.engine.org.app.domain.entity.ui.Notification.NotificationType.ERROR,
                        actionUrl,
                        "View Change Request"
                    );
                }
            } catch (IllegalArgumentException e) {
                log.warn("Invalid UUID format for createdBy: {}", creatorId);
            }
        } catch (Exception e) {
            log.error("Failed to create deployment notification", e);
            // Don't fail deployment if notification creation fails
        }
    }
    
    /**
     * Deploy a scheduled deployment immediately without waiting for scheduled time
     * 
     * @param deploymentId The ID of the scheduled deployment
     * @param reason The reason for deploying immediately (optional)
     */
    @Transactional
    public void deployNow(Long deploymentId, String reason) {
        ScheduledDeployment deployment = scheduledDeploymentRepository
            .findById(deploymentId)
            .orElseThrow(() -> new IllegalArgumentException("Deployment not found: " + deploymentId));
        
        if (deployment.getStatus() != ScheduledDeployment.DeploymentStatus.PENDING) {
            throw new IllegalStateException(
                "Cannot deploy immediately. Deployment is in status: " + deployment.getStatus() + 
                ". Only PENDING deployments can be deployed immediately."
            );
        }
        
        // Save the deployment reason
        if (reason != null && !reason.trim().isEmpty()) {
            deployment.setImmediateDeploymentReason(reason.trim());
            scheduledDeploymentRepository.save(deployment);
        }
        
        log.info("Deploying scheduled deployment {} immediately (was scheduled for {}). Reason: {}", 
            deploymentId, deployment.getScheduledTime(), reason != null ? reason : "N/A");
        
        // Execute the deployment immediately
        executeDeployment(deployment);
    }
    
    /**
     * Cancel a scheduled deployment
     */
    @Transactional
    public void cancelDeployment(Long deploymentId) {
        ScheduledDeployment deployment = scheduledDeploymentRepository
            .findById(deploymentId)
            .orElseThrow(() -> new IllegalArgumentException("Deployment not found: " + deploymentId));
        
        if (deployment.getStatus() == ScheduledDeployment.DeploymentStatus.PENDING) {
            deployment.setStatus(ScheduledDeployment.DeploymentStatus.CANCELLED);
            scheduledDeploymentRepository.save(deployment);
            log.info("Cancelled scheduled deployment {}", deploymentId);
        } else {
            throw new IllegalStateException(
                "Cannot cancel deployment in status: " + deployment.getStatus()
            );
        }
    }
    
    /**
     * Get upcoming deployments
     */
    public List<ScheduledDeployment> getUpcomingDeployments() {
        return scheduledDeploymentRepository
            .findByStatusAndScheduledTimeGreaterThanOrderByScheduledTimeAsc(
                ScheduledDeployment.DeploymentStatus.PENDING,
                Instant.now()
            );
    }
}

