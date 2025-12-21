package rule.engine.org.app.config;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import rule.engine.org.app.domain.repository.UserSessionRepository;
import rule.engine.org.app.security.UserAccountDetailsService;
import rule.engine.org.app.security.jwt.JwtTokenService;

import java.security.Principal;
import java.util.List;

/**
 * WebSocket interceptor to authenticate connections using JWT tokens.
 */
@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private final JwtTokenService jwtTokenService;
    private final UserAccountDetailsService userDetailsService;
    private final UserSessionRepository userSessionRepository;

    public WebSocketAuthInterceptor(
            JwtTokenService jwtTokenService,
            UserAccountDetailsService userDetailsService,
            UserSessionRepository userSessionRepository) {
        this.jwtTokenService = jwtTokenService;
        this.userDetailsService = userDetailsService;
        this.userSessionRepository = userSessionRepository;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(WebSocketAuthInterceptor.class);
        
        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            // Extract token from headers
            List<String> authHeaders = accessor.getNativeHeader("Authorization");
            String token = null;
            
            if (authHeaders != null && !authHeaders.isEmpty()) {
                String authHeader = authHeaders.get(0);
                if (StringUtils.hasText(authHeader) && authHeader.startsWith("Bearer ")) {
                    token = authHeader.substring(7);
                }
            }
            
            // Validate token and authenticate
            boolean authenticated = false;
            
            if (token != null && jwtTokenService.isTokenValid(token)) {
                // Check if session exists
                String tokenHash = jwtTokenService.hashToken(token);
                if (userSessionRepository.findByTokenHash(tokenHash).isPresent()) {
                    try {
                        String username = jwtTokenService.extractUsername(token);
                        UserDetails userDetails = userDetailsService.loadUserByUsername(username);
                        
                        Principal principal = new UsernamePasswordAuthenticationToken(
                                userDetails, null, userDetails.getAuthorities());
                        accessor.setUser(principal);
                        authenticated = true;
                        logger.info("WebSocket connection authenticated for user: {}", username);
                    } catch (Exception e) {
                        logger.warn("Failed to authenticate WebSocket connection: {}", e.getMessage());
                    }
                } else {
                    logger.warn("WebSocket connection rejected: token session not found in database");
                }
            } else {
                logger.warn("WebSocket connection rejected: invalid or missing JWT token");
            }
            
            // Reject connection if not authenticated
            if (!authenticated) {
                logger.error("WebSocket CONNECT rejected: authentication failed");
                // Throw exception to reject the connection
                // This will cause the STOMP connection to fail with an error
                throw new MessageDeliveryException("WebSocket connection rejected: authentication required");
            }
        }
        
        return message;
    }
}

