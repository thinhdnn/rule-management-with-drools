package rule.engine.org.app.config.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Properties that describe bootstrap user accounts created automatically.
 */
@ConfigurationProperties(prefix = "auth.bootstrap")
public class BootstrapUserProperties {

    private final UserCredentials administrator = new UserCredentials();
    private final UserCredentials editor = new UserCredentials();

    public UserCredentials getAdministrator() {
        return administrator;
    }

    public UserCredentials getEditor() {
        return editor;
    }

    public static class UserCredentials {
        private String email;
        private String password;
        private String displayName;

        public String getEmail() {
            return email;
        }

        public void setEmail(String email) {
            this.email = email;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public String getDisplayName() {
            return displayName;
        }

        public void setDisplayName(String displayName) {
            this.displayName = displayName;
        }
    }
}


