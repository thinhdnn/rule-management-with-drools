package rule.engine.org.app.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import rule.engine.org.app.domain.entity.ui.ChangeRequest;
import rule.engine.org.app.domain.entity.ui.ChangeRequestStatus;
import rule.engine.org.app.domain.entity.ui.FactType;

import java.util.List;
import java.util.Optional;

@Repository
public interface ChangeRequestRepository extends JpaRepository<ChangeRequest, Long> {

    /**
     * Find all change requests for a specific fact type
     */
    List<ChangeRequest> findByFactTypeOrderByCreatedAtDesc(FactType factType);

    /**
     * Find all change requests by status
     */
    List<ChangeRequest> findByStatusOrderByCreatedAtDesc(ChangeRequestStatus status);

    /**
     * Find all change requests for a specific fact type and status
     */
    List<ChangeRequest> findByFactTypeAndStatusOrderByCreatedAtDesc(FactType factType, ChangeRequestStatus status);

    /**
     * Find all pending change requests
     */
    @Query("SELECT cr FROM ChangeRequest cr WHERE cr.status = 'PENDING' ORDER BY cr.createdAt DESC")
    List<ChangeRequest> findAllPendingOrderByCreatedAtDesc();

    /**
     * Find all change requests ordered by creation date descending
     */
    List<ChangeRequest> findAllByOrderByCreatedAtDesc();

    @Query("""
            SELECT cr FROM ChangeRequest cr
            WHERE (:factType IS NULL OR cr.factType = :factType)
              AND (:status IS NULL OR cr.status = :status)
              AND cr.createdBy = :createdBy
            ORDER BY cr.createdAt DESC
            """)
    List<ChangeRequest> findOwnedChangeRequests(
            FactType factType, ChangeRequestStatus status, String createdBy);

    @Query("""
            SELECT cr FROM ChangeRequest cr
            WHERE (:factType IS NULL OR cr.factType = :factType)
              AND (:status IS NULL OR cr.status = :status)
            ORDER BY cr.createdAt DESC
            """)
    List<ChangeRequest> findAllChangeRequests(
            FactType factType, ChangeRequestStatus status);

    Optional<ChangeRequest> findByIdAndCreatedBy(Long id, String createdBy);

    /**
     * Find distinct fact types that have change requests
     */
    @Query("SELECT DISTINCT cr.factType FROM ChangeRequest cr")
    List<FactType> findDistinctFactTypes();
}

