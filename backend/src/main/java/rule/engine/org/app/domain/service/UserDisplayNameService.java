package rule.engine.org.app.domain.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import rule.engine.org.app.domain.entity.security.UserAccount;
import rule.engine.org.app.domain.repository.UserAccountRepository;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service to map user UUID to display name.
 * Caches results to avoid repeated database queries.
 */
@Service
public class UserDisplayNameService {

    private static final Logger log = LoggerFactory.getLogger(UserDisplayNameService.class);

    private final UserAccountRepository userAccountRepository;
    
    // In-memory cache to avoid repeated queries
    private final ConcurrentHashMap<String, String> displayNameCache = new ConcurrentHashMap<>();

    public UserDisplayNameService(UserAccountRepository userAccountRepository) {
        this.userAccountRepository = userAccountRepository;
    }

    /**
     * Get display name for a user UUID.
     * Returns the UUID if user not found or UUID is invalid.
     * 
     * @param userId UUID string or null
     * @return Display name or original userId if not found
     */
    public String getDisplayName(String userId) {
        if (userId == null || userId.trim().isEmpty()) {
            return null;
        }

        // Check cache first
        String cached = displayNameCache.get(userId);
        if (cached != null) {
            return cached;
        }

        try {
            UUID uuid = UUID.fromString(userId);
            return userAccountRepository.findById(uuid)
                .map(UserAccount::getDisplayName)
                .map(displayName -> {
                    // Cache the result
                    displayNameCache.put(userId, displayName);
                    return displayName;
                })
                .orElse(userId); // Return UUID if user not found
        } catch (IllegalArgumentException e) {
            // Invalid UUID format, return as-is
            log.debug("Invalid UUID format: {}", userId);
            return userId;
        }
    }

    /**
     * Clear the cache (useful for testing or when user data changes)
     */
    public void clearCache() {
        displayNameCache.clear();
    }

    /**
     * Clear cache for a specific user
     */
    public void clearCache(String userId) {
        if (userId != null) {
            displayNameCache.remove(userId);
        }
    }
}

