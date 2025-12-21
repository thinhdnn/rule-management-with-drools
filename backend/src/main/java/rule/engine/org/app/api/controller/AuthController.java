package rule.engine.org.app.api.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import rule.engine.org.app.api.request.auth.LoginRequest;
import rule.engine.org.app.api.response.auth.AuthResponse;
import rule.engine.org.app.api.response.auth.UserProfileResponse;
import rule.engine.org.app.domain.service.AuthService;
import rule.engine.org.app.security.UserPrincipal;

/**
 * Authentication API endpoints.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> me(@AuthenticationPrincipal UserPrincipal principal) {
        // principal will be null if:
        // - Token is expired
        // - Token signature is invalid (e.g., JWT secret changed after DB reset)
        // - Token format is invalid
        // - User doesn't exist in database (loadUserByUsername failed in filter)
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            return ResponseEntity.ok(authService.getCurrentProfile(principal));
        } catch (IllegalStateException ex) {
            // User no longer exists in database (e.g., after DB reset but user was recreated)
            // Return 401 to indicate session is no longer valid
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
    }
}


