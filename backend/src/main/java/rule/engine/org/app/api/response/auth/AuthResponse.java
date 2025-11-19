package rule.engine.org.app.api.response.auth;

/**
 * Authentication response payload containing tokens and profile info.
 */
public record AuthResponse(
        String accessToken,
        long expiresInSeconds,
        UserProfileResponse user) {}


