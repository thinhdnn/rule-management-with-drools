package rule.engine.org.app.domain.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import rule.engine.org.app.api.response.NotificationResponse;
import rule.engine.org.app.domain.entity.ui.Notification;

import java.util.UUID;

/**
 * Service for sending notifications via WebSocket.
 */
@Service
public class NotificationWebSocketService {

    private static final Logger log = LoggerFactory.getLogger(NotificationWebSocketService.class);
    private final SimpMessagingTemplate messagingTemplate;

    public NotificationWebSocketService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Send a notification to a specific user via WebSocket.
     */
    public void sendNotificationToUser(UUID userId, Notification notification) {
        try {
            NotificationResponse response = NotificationResponse.from(notification);
            String destination = "/topic/notifications/" + userId;
            messagingTemplate.convertAndSend(destination, response);
            log.debug("Sent notification {} to user {} via WebSocket", notification.getId(), userId);
        } catch (Exception e) {
            log.error("Failed to send notification via WebSocket to user {}", userId, e);
        }
    }

    /**
     * Send unread count update to a specific user via WebSocket.
     */
    public void sendUnreadCountToUser(UUID userId, long count) {
        try {
            String destination = "/topic/notifications/" + userId + "/unread-count";
            messagingTemplate.convertAndSend(destination, count);
            log.debug("Sent unread count {} to user {} via WebSocket", count, userId);
        } catch (Exception e) {
            log.error("Failed to send unread count via WebSocket to user {}", userId, e);
        }
    }
}

