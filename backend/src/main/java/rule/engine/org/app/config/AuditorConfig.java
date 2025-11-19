package rule.engine.org.app.config;

import java.util.Optional;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import rule.engine.org.app.security.UserPrincipal;

@Configuration
public class AuditorConfig {

    @Bean
    public AuditorAware<String> springSecurityAuditorAware() {
        return () -> {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication == null
                    || !authentication.isAuthenticated()
                    || "anonymousUser".equals(authentication.getPrincipal())) {
                return Optional.of("system");
            }
            Object principal = authentication.getPrincipal();
            if (principal instanceof UserPrincipal userPrincipal && userPrincipal.getId() != null) {
                return Optional.of(userPrincipal.getId().toString());
            }
            return Optional.ofNullable(authentication.getName());
        };
    }
}


