package rule.engine.org.app.security.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Collection;
import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import rule.engine.org.app.config.security.JwtProperties;
import rule.engine.org.app.domain.entity.security.UserAccount;
import rule.engine.org.app.domain.entity.security.UserRole;

/**
 * Helper service that encapsulates JWT creation and validation logic.
 */
@Component
public class JwtTokenService {

    private final JwtProperties jwtProperties;
    private SecretKey signingKey;

    public JwtTokenService(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
    }

    @PostConstruct
    public void initializeSigningKey() {
        if (jwtProperties.getSecret() == null || jwtProperties.getSecret().length() < 32) {
            throw new IllegalStateException("JWT secret must be at least 32 characters long.");
        }
        byte[] keyBytes = jwtProperties.getSecret().getBytes(java.nio.charset.StandardCharsets.UTF_8);
        signingKey = Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateAccessToken(UserAccount account) {
        Instant now = Instant.now();
        Instant expiry = now.plus(jwtProperties.getAccessTokenTtl());
        return Jwts.builder()
                .subject(account.getEmail())
                .issuer(jwtProperties.getIssuer())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .claim(
                        "roles",
                        account.getRoles().stream()
                                .map(UserRole::name)
                                .collect(Collectors.toList()))
                .signWith(signingKey)
                .compact();
    }

    public boolean isTokenValid(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    public String extractUsername(String token) {
        return parseClaims(token).getPayload().getSubject();
    }

    public Collection<UserRole> extractRoles(String token) {
        Claims claims = parseClaims(token).getPayload();
        List<String> roles = claims.get("roles", List.class);
        if (roles == null) {
            return java.util.Collections.emptyList();
        }
        return roles.stream().map(UserRole::valueOf).collect(Collectors.toList());
    }

    public long getAccessTokenTtlSeconds() {
        return jwtProperties.getAccessTokenTtl().getSeconds();
    }

    private Jws<Claims> parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token);
    }
}


