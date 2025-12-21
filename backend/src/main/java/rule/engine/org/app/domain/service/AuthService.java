package rule.engine.org.app.domain.service;

import java.time.Instant;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import rule.engine.org.app.api.request.auth.LoginRequest;
import rule.engine.org.app.api.response.auth.AuthResponse;
import rule.engine.org.app.api.response.auth.UserProfileResponse;
import rule.engine.org.app.domain.entity.security.UserAccount;
import rule.engine.org.app.domain.entity.security.UserSession;
import rule.engine.org.app.domain.repository.UserAccountRepository;
import rule.engine.org.app.domain.repository.UserSessionRepository;
import rule.engine.org.app.security.UserPrincipal;
import rule.engine.org.app.security.jwt.JwtTokenService;

/**
 * Application service that orchestrates login flow.
 */
@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final UserAccountRepository userAccountRepository;
    private final UserSessionRepository userSessionRepository;
    private final JwtTokenService jwtTokenService;

    public AuthService(
            AuthenticationManager authenticationManager,
            UserAccountRepository userAccountRepository,
            UserSessionRepository userSessionRepository,
            JwtTokenService jwtTokenService) {
        this.authenticationManager = authenticationManager;
        this.userAccountRepository = userAccountRepository;
        this.userSessionRepository = userSessionRepository;
        this.jwtTokenService = jwtTokenService;
    }

    @Transactional
    public AuthResponse login(LoginRequest request) throws AuthenticationException {
        Authentication authentication =
                authenticationManager.authenticate(
                        new UsernamePasswordAuthenticationToken(request.email(), request.password()));

        UserPrincipal principal = (UserPrincipal) authentication.getPrincipal();
        UserAccount account =
                userAccountRepository
                        .findByEmailIgnoreCase(principal.getUsername())
                        .orElseThrow(() -> new IllegalStateException("User not found after authentication"));

        String token = jwtTokenService.generateAccessToken(account);
        Instant issuedAt = jwtTokenService.extractIssuedAt(token);
        Instant expiresAt = jwtTokenService.extractExpiration(token);
        String tokenHash = jwtTokenService.hashToken(token);

        // Create session record
        // If session creation fails, still return token (graceful degradation)
        // But log the error for investigation
        try {
            UserSession session = new UserSession();
            session.setUser(account);
            session.setTokenHash(tokenHash);
            session.setIssuedAt(issuedAt != null ? issuedAt : Instant.now());
            session.setExpiresAt(expiresAt != null ? expiresAt : Instant.now().plusSeconds(jwtTokenService.getAccessTokenTtlSeconds()));
            userSessionRepository.save(session);
        } catch (Exception ex) {
            // Log error but don't fail login - session table might not exist yet (migration pending)
            org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(AuthService.class);
            logger.error("Failed to create user session for user: {}", account.getEmail(), ex);
            // Continue with login - token will still work, just won't be tracked in sessions table
        }

        UserProfileResponse profile =
                new UserProfileResponse(
                        account.getId(), account.getEmail(), account.getDisplayName(), account.getRoles());
        return new AuthResponse(token, jwtTokenService.getAccessTokenTtlSeconds(), profile);
    }

    @Transactional(readOnly = true)
    public UserProfileResponse getCurrentProfile(UserPrincipal principal) {
        return userAccountRepository
                .findByEmailIgnoreCase(principal.getUsername())
                .map(account -> new UserProfileResponse(
                        account.getId(), account.getEmail(), account.getDisplayName(), account.getRoles()))
                .orElseThrow(() -> new IllegalStateException("User not found for profile lookup"));
    }
}


