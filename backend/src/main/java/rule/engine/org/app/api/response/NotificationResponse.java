package rule.engine.org.app.api.response;

import java.time.Instant;
import java.util.UUID;
import rule.engine.org.app.domain.entity.ui.Notification;

/**
 * Response DTO for Notification.
 */
public record NotificationResponse(
        UUID id,
        String title,
        String message,
        Notification.NotificationType type,
        Boolean read,
        Instant readAt,
        String actionUrl,
        String actionLabel,
        Instant createdAt) {

    /**
     * Convert Notification entity to NotificationResponse DTO.
     */
    public static NotificationResponse from(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getTitle(),
                notification.getMessage(),
                notification.getType(),
                notification.getRead(),
                notification.getReadAt(),
                notification.getActionUrl(),
                notification.getActionLabel(),
                notification.getCreatedAt());
    }
}

