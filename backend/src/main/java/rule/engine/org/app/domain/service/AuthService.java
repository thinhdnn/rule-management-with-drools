package rule.engine.org.app.domain.service;

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
import rule.engine.org.app.domain.repository.UserAccountRepository;
import rule.engine.org.app.security.UserPrincipal;
import rule.engine.org.app.security.jwt.JwtTokenService;

/**
 * Application service that orchestrates login flow.
 */
@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final UserAccountRepository userAccountRepository;
    private final JwtTokenService jwtTokenService;

    public AuthService(
            AuthenticationManager authenticationManager,
            UserAccountRepository userAccountRepository,
            JwtTokenService jwtTokenService) {
        this.authenticationManager = authenticationManager;
        this.userAccountRepository = userAccountRepository;
        this.jwtTokenService = jwtTokenService;
    }

    @Transactional(readOnly = true)
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


