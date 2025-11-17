package rule.engine.org.app.domain.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rule.engine.org.app.domain.entity.ui.DecisionRule;
import rule.engine.org.app.domain.entity.ui.RuleOutput;
import rule.engine.org.app.domain.entity.ui.RuleOutputGroup;
import rule.engine.org.app.domain.repository.DecisionRuleRepository;
import rule.engine.org.app.domain.repository.RuleOutputRepository;
import rule.engine.org.app.domain.repository.RuleOutputGroupRepository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Service for managing rule versions
 * Handles creating new versions, retrieving version history, and version comparisons
 */
@Service
public class RuleVersionService {

    private final DecisionRuleRepository decisionRuleRepository;
    private final RuleOutputRepository ruleOutputRepository;
    private final RuleOutputGroupRepository ruleOutputGroupRepository;

    public RuleVersionService(
            DecisionRuleRepository decisionRuleRepository,
            RuleOutputRepository ruleOutputRepository,
            RuleOutputGroupRepository ruleOutputGroupRepository) {
        this.decisionRuleRepository = decisionRuleRepository;
        this.ruleOutputRepository = ruleOutputRepository;
        this.ruleOutputGroupRepository = ruleOutputGroupRepository;
    }

    /**
     * Create a new version of an existing rule
     * This method:
     * 1. Marks the current version as not latest (is_latest = false)
     * 2. Creates a new rule entity with incremented version number
     * 3. Copies all fields from the old rule to the new one
     * 4. Applies the updates from the updatedRule parameter
     * 5. Marks the new version as latest (is_latest = true)
     * 
     * @param ruleId The ID of the rule to create a new version from
     * @param updatedRule The rule object containing the updated fields
     * @param versionNotes Optional notes describing what changed in this version
     * @return The newly created rule version
     */
    @Transactional
    public DecisionRule createNewVersion(Long ruleId, DecisionRule updatedRule, String versionNotes) {
        // Find the current rule
        DecisionRule currentRule = decisionRuleRepository.findById(ruleId)
            .orElseThrow(() -> new RuntimeException("Rule not found with id: " + ruleId));

        // Mark current rule as not latest
        currentRule.setIsLatest(false);
        decisionRuleRepository.save(currentRule);

        // Create new version
        DecisionRule newVersion = new DecisionRule();
        
        // Copy all fields from updated rule
        newVersion.setRuleName(updatedRule.getRuleName());
        newVersion.setLabel(updatedRule.getLabel());
        newVersion.setRuleContent(updatedRule.getRuleContent());
        newVersion.setPriority(updatedRule.getPriority());
        newVersion.setStatus(updatedRule.getStatus());
        newVersion.setFactType(updatedRule.getFactType());
        
        // Set version tracking fields
        // If current rule is the first version, use its ID as parent
        // Otherwise, use the existing parent ID
        Long parentId = currentRule.getParentRuleId() != null 
            ? currentRule.getParentRuleId() 
            : currentRule.getId();
        newVersion.setParentRuleId(parentId);
        newVersion.setVersion(currentRule.getVersion() + 1);
        newVersion.setIsLatest(true);
        newVersion.setVersionNotes(versionNotes);

        // Save new version first to get ID
        newVersion = decisionRuleRepository.save(newVersion);
        
        // Copy RuleOutputGroup and RuleOutput entities from updatedRule to newVersion
        copyRuleOutputs(updatedRule, newVersion);
        
        return newVersion;
    }

    /**
     * Get all versions of a rule (including the rule itself and all its versions)
     * 
     * @param ruleId The ID of any version of the rule
     * @return List of all versions, sorted by version number (newest first)
     */
    public List<DecisionRule> getVersionHistory(Long ruleId) {
        DecisionRule rule = decisionRuleRepository.findById(ruleId)
            .orElseThrow(() -> new RuntimeException("Rule not found with id: " + ruleId));

        // Determine the parent rule ID
        Long parentId = rule.getParentRuleId() != null ? rule.getParentRuleId() : rule.getId();

        // Find all versions with this parent ID (including the parent itself)
        List<DecisionRule> versions = new ArrayList<>();
        
        // Add the parent rule
        decisionRuleRepository.findById(parentId).ifPresent(versions::add);
        
        // Add all child versions
        versions.addAll(decisionRuleRepository.findByParentRuleIdOrderByVersionDesc(parentId));
        
        // Sort by version descending (newest first)
        versions.sort((a, b) -> b.getVersion().compareTo(a.getVersion()));
        
        return versions;
    }

    /**
     * Get the latest version of a rule
     * 
     * @param ruleId The ID of any version of the rule
     * @return The latest version of the rule
     */
    public Optional<DecisionRule> getLatestVersion(Long ruleId) {
        DecisionRule rule = decisionRuleRepository.findById(ruleId)
            .orElseThrow(() -> new RuntimeException("Rule not found with id: " + ruleId));

        // Determine the parent rule ID
        Long parentId = rule.getParentRuleId() != null ? rule.getParentRuleId() : rule.getId();

        // Find the latest version
        return decisionRuleRepository.findByParentRuleIdAndIsLatestTrue(parentId)
            .or(() -> {
                // If no child version is latest, check if the parent itself is latest
                return decisionRuleRepository.findById(parentId)
                    .filter(DecisionRule::getIsLatest);
            });
    }

    /**
     * Restore an old version by making it the latest
     * This creates a new version with the same content as the old version
     * 
     * @param versionId The ID of the version to restore
     * @param versionNotes Optional notes for the restoration
     * @return The newly created version (copy of the old version)
     */
    @Transactional
    public DecisionRule restoreVersion(Long versionId, String versionNotes) {
        DecisionRule versionToRestore = decisionRuleRepository.findById(versionId)
            .orElseThrow(() -> new RuntimeException("Version not found with id: " + versionId));

        // Get the current latest version to get the next version number
        Long parentId = versionToRestore.getParentRuleId() != null 
            ? versionToRestore.getParentRuleId() 
            : versionToRestore.getId();
        
        DecisionRule currentLatest = decisionRuleRepository.findByParentRuleIdAndIsLatestTrue(parentId)
            .orElse(decisionRuleRepository.findById(parentId)
                .orElseThrow(() -> new RuntimeException("Parent rule not found")));

        // Create new version as a copy of the version to restore
        String notes = versionNotes != null 
            ? versionNotes 
            : "Restored from version " + versionToRestore.getVersion();
        
        return createNewVersion(currentLatest.getId(), versionToRestore, notes);
    }

    /**
     * Get all latest versions of all rules (for list view)
     * 
     * @return List of the latest version of each rule
     */
    public List<DecisionRule> getAllLatestRules() {
        return decisionRuleRepository.findByIsLatestTrue();
    }

    /**
     * Check if a rule is the latest version
     * 
     * @param ruleId The ID of the rule to check
     * @return true if this is the latest version, false otherwise
     */
    public boolean isLatestVersion(Long ruleId) {
        return decisionRuleRepository.findById(ruleId)
            .map(DecisionRule::getIsLatest)
            .orElse(false);
    }

    /**
     * Copy RuleOutputGroup and RuleOutput entities from source rule to target rule
     * 
     * @param sourceRule The rule to copy outputs from
     * @param targetRule The rule to copy outputs to
     */
    @Transactional
    private void copyRuleOutputs(DecisionRule sourceRule, DecisionRule targetRule) {
        // Get all output groups from source rule
        List<RuleOutputGroup> sourceGroups = ruleOutputGroupRepository
            .findByDecisionRuleIdOrderByOrderIndexAsc(sourceRule.getId());
        
        if (sourceGroups.isEmpty()) {
            return; // No outputs to copy
        }
        
        // Map to track old group ID -> new group
        Map<Long, RuleOutputGroup> groupMap = new HashMap<>();
        
        // Copy output groups
        for (RuleOutputGroup sourceGroup : sourceGroups) {
            RuleOutputGroup newGroup = new RuleOutputGroup();
            newGroup.setDecisionRule(targetRule);
            newGroup.setType(sourceGroup.getType());
            newGroup.setOrderIndex(sourceGroup.getOrderIndex());
            
            // Handle parent group mapping if exists
            if (sourceGroup.getParent() != null) {
                RuleOutputGroup mappedParent = groupMap.get(sourceGroup.getParent().getId());
                if (mappedParent != null) {
                    newGroup.setParent(mappedParent);
                }
            }
            
            newGroup = ruleOutputGroupRepository.save(newGroup);
            groupMap.put(sourceGroup.getId(), newGroup);
        }
        
        // Get all outputs from source rule
        List<RuleOutput> sourceOutputs = ruleOutputRepository
            .findByDecisionRuleIdOrderByOrderIndexAsc(sourceRule.getId());
        
        // Copy outputs
        for (RuleOutput sourceOutput : sourceOutputs) {
            RuleOutput newOutput = new RuleOutput();
            newOutput.setDecisionRule(targetRule);
            
            // Map to new group
            RuleOutputGroup mappedGroup = groupMap.get(sourceOutput.getGroup().getId());
            if (mappedGroup != null) {
                newOutput.setGroup(mappedGroup);
            }
            
            // Copy all output fields
            newOutput.setAction(sourceOutput.getAction());
            newOutput.setResult(sourceOutput.getResult());
            newOutput.setScore(sourceOutput.getScore());
            newOutput.setFlag(sourceOutput.getFlag());
            newOutput.setDocumentType(sourceOutput.getDocumentType());
            newOutput.setDocumentId(sourceOutput.getDocumentId());
            newOutput.setDescription(sourceOutput.getDescription());
            newOutput.setOrderIndex(sourceOutput.getOrderIndex());
            
            ruleOutputRepository.save(newOutput);
        }
    }
}

