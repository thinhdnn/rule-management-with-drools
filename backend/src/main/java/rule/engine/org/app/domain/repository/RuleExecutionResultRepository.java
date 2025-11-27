package rule.engine.org.app.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import rule.engine.org.app.domain.entity.ui.RuleExecutionResult;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface RuleExecutionResultRepository extends JpaRepository<RuleExecutionResult, Long> {

    /**
     * Find all execution results for a specific declaration
     */
    List<RuleExecutionResult> findByDeclarationId(String declarationId);

    /**
     * Find all execution results for a specific rule
     */
    List<RuleExecutionResult> findByDecisionRuleId(Long ruleId);

    /**
     * Find matched rules for a declaration
     */
    List<RuleExecutionResult> findByDeclarationIdAndMatchedTrue(String declarationId);

    /**
     * Find executions by action type
     */
    List<RuleExecutionResult> findByRuleAction(String action);

    /**
     * Find recent executions
     */
    List<RuleExecutionResult> findByExecutedAtAfterOrderByExecutedAtDesc(LocalDateTime since);

    /**
     * Count how many times a rule has fired
     */
    @Query("SELECT COUNT(r) FROM RuleExecutionResult r WHERE r.decisionRule.id = :ruleId AND r.matched = true")
    Long countRuleFires(@Param("ruleId") Long ruleId);

    /**
     * Find declarations flagged by a specific rule
     */
    @Query("SELECT r FROM RuleExecutionResult r " +
           "WHERE r.decisionRule.id = :ruleId " +
           "AND r.ruleAction = 'FLAG' " +
           "ORDER BY r.executedAt DESC")
    List<RuleExecutionResult> findFlaggedByRule(@Param("ruleId") Long ruleId);

    /**
     * Find all execution results for rules created by a specific user
     * Optionally filter by execution source
     * Uses JOIN FETCH to eagerly load DecisionRule to avoid LazyInitializationException
     */
    @Query("SELECT r FROM RuleExecutionResult r " +
           "JOIN FETCH r.decisionRule d " +
           "WHERE d.createdBy = :userId " +
           "AND (:source IS NULL OR r.executionSource = :source) " +
           "ORDER BY r.executedAt DESC")
    List<RuleExecutionResult> findByUserRulesAndSource(
            @Param("userId") String userId,
            @Param("source") String source);
}

