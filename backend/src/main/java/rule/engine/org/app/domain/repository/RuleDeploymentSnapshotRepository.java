package rule.engine.org.app.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import rule.engine.org.app.domain.entity.ui.FactType;
import rule.engine.org.app.domain.entity.ui.RuleDeploymentSnapshot;

import java.util.List;

/**
 * Repository for querying rule deployment snapshots
 */
@Repository
public interface RuleDeploymentSnapshotRepository extends JpaRepository<RuleDeploymentSnapshot, Long> {
    
    /**
     * Find all rules deployed in a specific container version and fact type
     */
    List<RuleDeploymentSnapshot> findByFactTypeAndContainerVersionOrderByRulePriorityAsc(
        FactType factType, 
        Integer containerVersion
    );
    
    /**
     * Find all snapshots for a specific fact type, ordered by version descending
     */
    List<RuleDeploymentSnapshot> findByFactTypeOrderByContainerVersionDesc(FactType factType);
    
    /**
     * Get distinct container versions for a fact type
     */
    @Query("SELECT DISTINCT s.containerVersion FROM RuleDeploymentSnapshot s WHERE s.factType = ?1 ORDER BY s.containerVersion DESC")
    List<Integer> findDistinctContainerVersionsByFactType(FactType factType);
    
    /**
     * Count rules in a specific container version
     */
    Long countByFactTypeAndContainerVersion(FactType factType, Integer containerVersion);
    
    /**
     * Find all snapshots for a specific rule across versions
     */
    List<RuleDeploymentSnapshot> findByRuleIdOrderByContainerVersionDesc(Long ruleId);
    
    /**
     * Get the latest container version for a fact type
     */
    @Query("SELECT MAX(s.containerVersion) FROM RuleDeploymentSnapshot s WHERE s.factType = ?1")
    Integer findMaxContainerVersionByFactType(FactType factType);
}

