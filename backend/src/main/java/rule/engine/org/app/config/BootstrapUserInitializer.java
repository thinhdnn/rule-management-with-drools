package rule.engine.org.app.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import rule.engine.org.app.config.security.BootstrapUserProperties;
import rule.engine.org.app.config.security.BootstrapUserProperties.UserCredentials;
import rule.engine.org.app.domain.entity.security.UserAccount;
import rule.engine.org.app.domain.entity.security.UserRole;
import rule.engine.org.app.domain.repository.UserAccountRepository;

/**
 * Seeds default accounts (rule administrator/editor) when they do not yet exist.
 */
@Component
public class BootstrapUserInitializer {

    private static final Logger log = LoggerFactory.getLogger(BootstrapUserInitializer.class);

    private final UserAccountRepository userAccountRepository;
    private final PasswordEncoder passwordEncoder;
    private final BootstrapUserProperties properties;

    public BootstrapUserInitializer(
            UserAccountRepository userAccountRepository,
            PasswordEncoder passwordEncoder,
            BootstrapUserProperties properties) {
        this.userAccountRepository = userAccountRepository;
        this.passwordEncoder = passwordEncoder;
        this.properties = properties;
    }

    @PostConstruct
    @Transactional
    public void ensureDefaultUsersExist() {
        createIfMissing(
                properties.getAdministrator(),
                UserRole.RULE_ADMINISTRATOR,
                "Rule Administrator");
        createIfMissing(
                properties.getEditor(),
                UserRole.RULE_EDITOR,
                "Rule Editor");
    }

    private void createIfMissing(UserCredentials user, UserRole role, String defaultDisplayName) {
        String email = normalize(user.getEmail());
        if (email == null) {
            log.warn("Bootstrap configuration missing email for {}", role);
            return;
        }
        if (userAccountRepository.existsByEmailIgnoreCase(email)) {
            return;
        }

        String password = user.getPassword();
        if (password == null || password.length() < 8) {
            log.warn("Bootstrap password for {} must be at least 8 characters", role);
            return;
        }

        UserAccount account = new UserAccount();
        account.setEmail(email);
        account.setDisplayName(
                user.getDisplayName() != null ? user.getDisplayName() : defaultDisplayName);
        account.setPassword(passwordEncoder.encode(password));
        account.getRoles().add(role);
        userAccountRepository.save(account);
        log.info("Created bootstrap user '{}' with role {}", email, role);
    }

    private String normalize(String value) {
        return value == null ? null : value.trim().toLowerCase();
    }
}

