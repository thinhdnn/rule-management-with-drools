package rule.engine.org.app.api.response.auth;

import java.util.Set;
import java.util.UUID;
import rule.engine.org.app.domain.entity.security.UserRole;

/**
 * Lightweight user profile returned to the frontend.
 */
public record UserProfileResponse(
        UUID id,
        String email,
        String displayName,
        Set<UserRole> roles) {}


