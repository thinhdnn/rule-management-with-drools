package rule.engine.org.app.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import rule.engine.org.app.domain.entity.ui.RuleGuideDraft;

import java.util.Optional;
import java.util.UUID;

/**
 * Repository for RuleGuideDraft entities.
 */
@Repository
public interface RuleGuideDraftRepository extends JpaRepository<RuleGuideDraft, UUID> {

    /**
     * Find draft by user ID.
     * Each user can have at most one active draft.
     */
    Optional<RuleGuideDraft> findByUserId(UUID userId);

    /**
     * Delete draft by user ID.
     */
    void deleteByUserId(UUID userId);
}

