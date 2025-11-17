package rule.engine.org.app.domain.service;

import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rule.engine.org.app.domain.entity.ui.DecisionRule;
import rule.engine.org.app.domain.entity.ui.FactType;
import rule.engine.org.app.domain.entity.ui.RuleStatus;
import rule.engine.org.app.domain.entity.ui.RuleDeploymentSnapshot;
import rule.engine.org.app.domain.repository.DecisionRuleRepository;
import rule.engine.org.app.domain.repository.RuleDeploymentSnapshotRepository;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Service for activating historical versions of rules
 * 
 * This allows switching to any previously deployed version by:
 * 1. Finding all rules that were active in the target version
 * 2. Deactivating currently active rules
 * 3. Activating rules from the target version
 * 4. Optionally creating a new version or rebuilding the current one
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class VersionActivationService {

    private final DecisionRuleRepository decisionRuleRepository;
    private final RuleDeploymentSnapshotRepository snapshotRepository;
    private final RuleEngineManager ruleEngineManager;

    /**
     * Activate a historical version
     * 
     * @param factType The fact type to activate version for
     * @param targetVersion The version to activate
     * @param createNewVersion If true, create a new version (increment). If false, rebuild current version.
     * @param activationNotes Optional notes about why this version is being activated
     * @return Result of the activation
     */
    @Transactional
    public VersionActivationResult activateVersion(
            FactType factType, 
            Integer targetVersion,
            boolean createNewVersion,
            String activationNotes) {
        
        log.info("Activating version {} for fact type: {} (createNewVersion={})", 
            targetVersion, factType.getValue(), createNewVersion);
        
        // 1. Get snapshot of target version (find which rules were active)
        List<RuleDeploymentSnapshot> targetSnapshots = snapshotRepository
            .findByFactTypeAndContainerVersionOrderByRulePriorityAsc(factType, targetVersion);
        
        if (targetSnapshots.isEmpty()) {
            String message = String.format(
                "No snapshot found for version %d of fact type %s", 
                targetVersion, factType.getValue()
            );
            log.error(message);
            return VersionActivationResult.builder()
                .success(false)
                .message(message)
                .factType(factType.getValue())
                .targetVersion(targetVersion)
                .build();
        }
        
        log.info("Found {} rules in target version {}", targetSnapshots.size(), targetVersion);
        
        // 2. Extract rule IDs from target version
        Set<Long> targetRuleIds = targetSnapshots.stream()
            .map(RuleDeploymentSnapshot::getRuleId)
            .collect(Collectors.toSet());
        
        // 3. Deactivate all currently active rules for this fact type
        List<DecisionRule> currentActiveRules = decisionRuleRepository
            .findByFactTypeAndStatusAndIsLatest(factType, RuleStatus.ACTIVE, true);
        
        int deactivatedCount = 0;
        for (DecisionRule rule : currentActiveRules) {
            rule.setStatus(RuleStatus.INACTIVE);
            decisionRuleRepository.save(rule);
            deactivatedCount++;
        }
        
        log.info("Deactivated {} currently active rules", deactivatedCount);
        
        // 4. Activate rules from target version
        int activatedCount = 0;
        int notFoundCount = 0;
        
        for (Long ruleId : targetRuleIds) {
            // Try to find the latest version of this rule
            DecisionRule rule = decisionRuleRepository
                .findById(ruleId)
                .orElse(null);
            
            if (rule == null) {
                log.warn("Rule ID {} from version {} not found in database", ruleId, targetVersion);
                notFoundCount++;
                continue;
            }
            
            // Activate the rule
            rule.setStatus(RuleStatus.ACTIVE);
            decisionRuleRepository.save(rule);
            activatedCount++;
            
            log.debug("Activated rule: {} (ID: {})", rule.getRuleName(), rule.getId());
        }
        
        log.info("Activated {} rules, {} not found", activatedCount, notFoundCount);
        
        // 5. Rebuild/deploy rules (this will create snapshot)
        if (createNewVersion) {
            // Create new version by deploying (increments version)
            ruleEngineManager.deployRules(factType.getValue());
            log.info("Created new version with rules from v{}", targetVersion);
        } else {
            // Rebuild current version (no increment)
            ruleEngineManager.rebuildRules(factType.getValue());
            log.info("Rebuilt current version with rules from v{}", targetVersion);
        }
        
        // 6. Build result
        String message = createNewVersion 
            ? String.format("Successfully created new version with %d rules from v%d", activatedCount, targetVersion)
            : String.format("Successfully rebuilt current version with %d rules from v%d", activatedCount, targetVersion);
        
        if (notFoundCount > 0) {
            message += String.format(" (%d rules not found)", notFoundCount);
        }
        
        return VersionActivationResult.builder()
            .success(true)
            .message(message)
            .factType(factType.getValue())
            .targetVersion(targetVersion)
            .createdNewVersion(createNewVersion)
            .deactivatedRules(deactivatedCount)
            .activatedRules(activatedCount)
            .notFoundRules(notFoundCount)
            .build();
    }

    /**
     * Result DTO for version activation
     */
    @Data
    @Builder
    public static class VersionActivationResult {
        private Boolean success;
        private String message;
        private String factType;
        private Integer targetVersion;
        private Boolean createdNewVersion;
        private Integer deactivatedRules;
        private Integer activatedRules;
        private Integer notFoundRules;
    }
}
