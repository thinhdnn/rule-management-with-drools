package rule.engine.org.app.domain.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rule.engine.org.app.domain.entity.ui.Notification;
import rule.engine.org.app.domain.repository.NotificationRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Service for managing notifications.
 */
@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final NotificationWebSocketService webSocketService;

    public NotificationService(
            NotificationRepository notificationRepository,
            NotificationWebSocketService webSocketService) {
        this.notificationRepository = notificationRepository;
        this.webSocketService = webSocketService;
    }

    /**
     * Create a new notification for a user.
     */
    @Transactional
    public Notification createNotification(
            UUID userId,
            String title,
            String message,
            Notification.NotificationType type,
            String actionUrl,
            String actionLabel) {
        Notification notification = new Notification();
        notification.setUserId(userId);
        notification.setTitle(title);
        notification.setMessage(message);
        notification.setType(type);
        notification.setRead(false);
        notification.setActionUrl(actionUrl);
        notification.setActionLabel(actionLabel);
        Notification saved = notificationRepository.save(notification);
        
        // Send notification via WebSocket
        webSocketService.sendNotificationToUser(userId, saved);
        
        // Send updated unread count
        long unreadCount = notificationRepository.countByUserIdAndReadFalse(userId);
        webSocketService.sendUnreadCountToUser(userId, unreadCount);
        
        return saved;
    }

    /**
     * Get all notifications for a user, optionally filtered by read status.
     */
    @Transactional(readOnly = true)
    public List<Notification> getNotifications(UUID userId, Boolean read, Integer limit) {
        if (read != null) {
            List<Notification> notifications = notificationRepository.findByUserIdAndReadOrderByCreatedAtDesc(userId, read);
            if (limit != null && limit > 0) {
                return notifications.stream().limit(limit).toList();
            }
            return notifications;
        } else {
            List<Notification> notifications = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
            if (limit != null && limit > 0) {
                return notifications.stream().limit(limit).toList();
            }
            return notifications;
        }
    }

    /**
     * Get a specific notification by ID (ensures it belongs to the user).
     */
    @Transactional(readOnly = true)
    public Notification getNotification(UUID id, UUID userId) {
        return notificationRepository
                .findByIdAndUserId(id, userId)
                .orElseThrow(() -> new IllegalArgumentException("Notification not found"));
    }

    /**
     * Get unread count for a user.
     */
    @Transactional(readOnly = true)
    public long getUnreadCount(UUID userId) {
        return notificationRepository.countByUserIdAndReadFalse(userId);
    }

    /**
     * Mark a notification as read.
     */
    @Transactional
    public void markAsRead(UUID id, UUID userId) {
        int updated = notificationRepository.markAsRead(id, userId, Instant.now());
        if (updated == 0) {
            throw new IllegalArgumentException("Notification not found or already read");
        }
        
        // Send updated unread count
        long unreadCount = notificationRepository.countByUserIdAndReadFalse(userId);
        webSocketService.sendUnreadCountToUser(userId, unreadCount);
    }

    /**
     * Mark all notifications as read for a user.
     */
    @Transactional
    public void markAllAsRead(UUID userId) {
        notificationRepository.markAllAsReadByUserId(userId, Instant.now());
        
        // Send updated unread count (should be 0)
        webSocketService.sendUnreadCountToUser(userId, 0);
    }

    /**
     * Delete a notification.
     */
    @Transactional
    public void deleteNotification(UUID id, UUID userId) {
        Notification notification = getNotification(id, userId);
        boolean wasUnread = !notification.getRead();
        notificationRepository.delete(notification);
        
        // Send updated unread count if deleted notification was unread
        if (wasUnread) {
            long unreadCount = notificationRepository.countByUserIdAndReadFalse(userId);
            webSocketService.sendUnreadCountToUser(userId, unreadCount);
        }
    }

    /**
     * Clear all notifications for a user.
     */
    @Transactional
    public void clearAll(UUID userId) {
        notificationRepository.deleteByUserId(userId);
        
        // Send updated unread count (should be 0)
        webSocketService.sendUnreadCountToUser(userId, 0);
    }
}

