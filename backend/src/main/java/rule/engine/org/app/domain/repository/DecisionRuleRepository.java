package rule.engine.org.app.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import rule.engine.org.app.domain.entity.ui.DecisionRule;
import rule.engine.org.app.domain.entity.ui.FactType;
import rule.engine.org.app.domain.entity.ui.RuleStatus;

import java.util.List;
import java.util.Optional;

public interface DecisionRuleRepository extends JpaRepository<DecisionRule, Long> {
    
    List<DecisionRule> findByStatus(RuleStatus status);
    
    List<DecisionRule> findByStatusOrderByPriorityAsc(RuleStatus status);
    
    // ========== VERSION MANAGEMENT QUERIES ==========
    
    /**
     * Find all versions of a rule by parent rule ID, ordered by version descending
     */
    List<DecisionRule> findByParentRuleIdOrderByVersionDesc(Long parentRuleId);
    
    /**
     * Find the latest version of a rule by parent rule ID
     */
    Optional<DecisionRule> findByParentRuleIdAndIsLatestTrue(Long parentRuleId);
    
    /**
     * Find all rules that are the latest version (for list view)
     */
    List<DecisionRule> findByIsLatestTrue();
    List<DecisionRule> findByIsLatestTrueAndCreatedByOrderByCreatedAtDesc(String createdBy);
    List<DecisionRule> findByCreatedByOrderByCreatedAtDesc(String createdBy);
    java.util.Optional<DecisionRule> findByIdAndCreatedBy(Long id, String createdBy);
    
    /**
     * Find all latest active rules, ordered by priority
     */
    List<DecisionRule> findByIsLatestTrueAndStatusOrderByPriorityAsc(RuleStatus status);
    
    /**
     * Find all latest active rules for a specific fact type, ordered by priority
     */
    List<DecisionRule> findByFactTypeAndIsLatestTrueAndStatusOrderByPriorityAsc(FactType factType, RuleStatus status);
    
    /**
     * Find all rules by fact type, status, and latest flag
     * Used for deployment to ensure only active and latest rules are deployed
     */
    List<DecisionRule> findByFactTypeAndStatusAndIsLatest(FactType factType, RuleStatus status, Boolean isLatest);
    
    /**
     * Find all latest rules for a fact type (regardless of status)
     * Used for change detection to compare with deployed version
     */
    List<DecisionRule> findByFactTypeAndIsLatestTrue(FactType factType);
    
    /**
     * Find rule by rule name and isLatest flag (for duplicate checking)
     */
    Optional<DecisionRule> findByRuleNameAndIsLatestTrue(String ruleName);
    
    /**
     * Find all distinct fact types
     */
    @org.springframework.data.jpa.repository.Query("SELECT DISTINCT d.factType FROM DecisionRule d WHERE d.isLatest = true")
    List<FactType> findDistinctFactTypes();
}

