package rule.engine.org.app.security.jwt;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import rule.engine.org.app.domain.repository.UserSessionRepository;
import rule.engine.org.app.security.UserAccountDetailsService;

/**
 * Filter that extracts JWT from the Authorization header and populates the security context.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenService jwtTokenService;
    private final UserAccountDetailsService userDetailsService;
    private final UserSessionRepository userSessionRepository;

    public JwtAuthenticationFilter(
            JwtTokenService jwtTokenService,
            UserAccountDetailsService userDetailsService,
            UserSessionRepository userSessionRepository) {
        this.jwtTokenService = jwtTokenService;
        this.userDetailsService = userDetailsService;
        this.userSessionRepository = userSessionRepository;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String requestUri = request.getRequestURI();
        org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(JwtAuthenticationFilter.class);
        
        // Skip filter completely for login endpoint, actuator, and WebSocket - no token processing needed
        // This must be done before any token validation to avoid interfering with permitAll()
        // WebSocket authentication is handled by WebSocketAuthInterceptor
        if (requestUri.contains("/api/auth/login") 
                || requestUri.contains("/actuator")
                || requestUri.startsWith("/ws/")) {
            filterChain.doFilter(request, response);
            return;
        }
        
        try {
            String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
            
            // Enhanced logging for /executions endpoint
            boolean isExecutionsEndpoint = requestUri.contains("/executions");
            
            if (isExecutionsEndpoint) {
                logger.info("JwtAuthenticationFilter processing /executions - authHeader present: {}, URI: {}", 
                    StringUtils.hasText(authHeader), requestUri);
            }
            
            if (StringUtils.hasText(authHeader) && authHeader.startsWith(BEARER_PREFIX)) {
                String token = authHeader.substring(BEARER_PREFIX.length());
                try {
                    boolean isValid = jwtTokenService.isTokenValid(token);
                    boolean hasExistingAuth = SecurityContextHolder.getContext().getAuthentication() != null;
                    
                    if (isExecutionsEndpoint) {
                        logger.info("Token validation - isValid: {}, hasExistingAuth: {}", isValid, hasExistingAuth);
                    }
                    
                    if (isValid && !hasExistingAuth) {
                        // Check if session exists in database
                        // This ensures tokens from before DB reset are invalid
                        String tokenHash = jwtTokenService.hashToken(token);
                        boolean sessionExists = userSessionRepository.findByTokenHash(tokenHash).isPresent();
                        
                        if (!sessionExists) {
                            logger.warn("Token session not found in database for request: {}", requestUri);
                            SecurityContextHolder.clearContext();
                            filterChain.doFilter(request, response);
                            return;
                        }

                        String username = jwtTokenService.extractUsername(token);
                        UserDetails userDetails = userDetailsService.loadUserByUsername(username);
                        
                        if (isExecutionsEndpoint) {
                            logger.info("Setting authentication for user: {}, principal type: {}", 
                                username, userDetails.getClass().getName());
                        }
                        
                        UsernamePasswordAuthenticationToken authentication =
                                new UsernamePasswordAuthenticationToken(
                                        userDetails, null, userDetails.getAuthorities());
                        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                        SecurityContextHolder.getContext().setAuthentication(authentication);
                        
                        if (isExecutionsEndpoint) {
                            logger.info("Authentication set successfully for /executions");
                        }
                    } else if (!isValid) {
                        logger.warn("Invalid JWT token for request: {}", requestUri);
                    } else if (hasExistingAuth) {
                        if (isExecutionsEndpoint) {
                            logger.info("Authentication already exists for /executions");
                        }
                    }
                } catch (Exception ex) {
                    logger.error("Error processing JWT token for request: {}", requestUri, ex);
                    SecurityContextHolder.clearContext();
                }
            } else {
                // Log missing auth header for protected endpoints
                // Skip logging for WebSocket, login, and actuator endpoints
                if (!requestUri.startsWith("/api/auth/login") 
                        && !requestUri.startsWith("/actuator")
                        && !requestUri.startsWith("/ws/")) {
                    logger.warn("Missing or invalid Authorization header for request: {}", requestUri);
                }
            }
        } catch (Exception ex) {
            // If any error occurs, log and continue - don't block the request
            logger.error("Unexpected error in JwtAuthenticationFilter for request: {}", requestUri, ex);
        }

        filterChain.doFilter(request, response);
    }
}


