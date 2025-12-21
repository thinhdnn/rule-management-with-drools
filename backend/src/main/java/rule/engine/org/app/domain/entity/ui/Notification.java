package rule.engine.org.app.domain.entity.ui;

import jakarta.persistence.*;
import lombok.Data;
import lombok.EqualsAndHashCode;
import rule.engine.org.app.domain.entity.common.BaseAuditableEntity;

import java.time.Instant;
import java.util.UUID;

/**
 * Notification entity for user notifications.
 * Stores notifications for various system events like change request approvals,
 * deployment completions, rule validation failures, etc.
 */
@Entity
@Table(name = "notifications")
@Data
@EqualsAndHashCode(callSuper = true)
public class Notification extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "uuid")
    private UUID id;

    /**
     * User who owns this notification
     */
    @Column(name = "user_id", nullable = false, columnDefinition = "uuid")
    private UUID userId;

    /**
     * Notification title
     */
    @Column(name = "title", nullable = false, length = 255)
    private String title;

    /**
     * Notification message content
     */
    @Column(name = "message", nullable = false, columnDefinition = "text")
    private String message;

    /**
     * Notification type: SUCCESS, ERROR, WARNING, INFO, SYSTEM
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private NotificationType type;

    /**
     * Whether the notification has been read
     */
    @Column(name = "read", nullable = false)
    private Boolean read = false;

    /**
     * Timestamp when notification was marked as read
     */
    @Column(name = "read_at")
    private Instant readAt;

    /**
     * Optional URL to navigate to when notification is clicked
     */
    @Column(name = "action_url", length = 500)
    private String actionUrl;

    /**
     * Optional label for the action button
     */
    @Column(name = "action_label", length = 100)
    private String actionLabel;

    /**
     * Notification type enum
     */
    public enum NotificationType {
        SUCCESS,
        ERROR,
        WARNING,
        INFO,
        SYSTEM
    }
}

