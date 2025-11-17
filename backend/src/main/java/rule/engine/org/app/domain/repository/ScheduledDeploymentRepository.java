package rule.engine.org.app.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import rule.engine.org.app.domain.entity.ui.FactType;
import rule.engine.org.app.domain.entity.ui.ScheduledDeployment;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Repository for managing scheduled deployments
 */
@Repository
public interface ScheduledDeploymentRepository extends JpaRepository<ScheduledDeployment, Long> {
    
    /**
     * Find all pending deployments that are due (scheduledTime <= now)
     */
    List<ScheduledDeployment> findByStatusAndScheduledTimeLessThanEqualOrderByScheduledTimeAsc(
        ScheduledDeployment.DeploymentStatus status, 
        Instant now
    );
    
    /**
     * Find all deployments by status
     */
    List<ScheduledDeployment> findByStatusOrderByScheduledTimeDesc(
        ScheduledDeployment.DeploymentStatus status
    );
    
    /**
     * Find deployment by change request ID
     */
    Optional<ScheduledDeployment> findByChangeRequestId(Long changeRequestId);
    
    /**
     * Find all deployments for a specific fact type
     */
    List<ScheduledDeployment> findByFactTypeOrderByScheduledTimeDesc(FactType factType);
    
    /**
     * Find all upcoming deployments (PENDING status, scheduled in future)
     */
    List<ScheduledDeployment> findByStatusAndScheduledTimeGreaterThanOrderByScheduledTimeAsc(
        ScheduledDeployment.DeploymentStatus status,
        Instant now
    );
}

