package rule.engine.org.app.domain.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import rule.engine.org.app.domain.entity.ui.Notification;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for {@link Notification}.
 */
@Repository
public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    /**
     * Find all notifications for a user, ordered by creation date descending
     */
    List<Notification> findByUserIdOrderByCreatedAtDesc(UUID userId);

    /**
     * Find notifications for a user filtered by read status
     */
    List<Notification> findByUserIdAndReadOrderByCreatedAtDesc(UUID userId, Boolean read);

    /**
     * Count unread notifications for a user
     */
    long countByUserIdAndReadFalse(UUID userId);

    /**
     * Find notification by ID and user ID (for security)
     */
    Optional<Notification> findByIdAndUserId(UUID id, UUID userId);

    /**
     * Mark a notification as read
     */
    @Modifying
    @Query("UPDATE Notification n SET n.read = true, n.readAt = :readAt WHERE n.id = :id AND n.userId = :userId")
    int markAsRead(@Param("id") UUID id, @Param("userId") UUID userId, @Param("readAt") Instant readAt);

    /**
     * Mark all notifications as read for a user
     */
    @Modifying
    @Query("UPDATE Notification n SET n.read = true, n.readAt = :readAt WHERE n.userId = :userId AND n.read = false")
    int markAllAsReadByUserId(@Param("userId") UUID userId, @Param("readAt") Instant readAt);

    /**
     * Delete all notifications for a user
     */
    void deleteByUserId(UUID userId);

    /**
     * Find notifications with pagination support
     */
    @Query("SELECT n FROM Notification n WHERE n.userId = :userId ORDER BY n.createdAt DESC")
    List<Notification> findByUserIdWithPagination(@Param("userId") UUID userId, org.springframework.data.domain.Pageable pageable);
}

