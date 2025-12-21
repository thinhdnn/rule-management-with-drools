package rule.engine.org.app.security;

import java.time.Instant;
import java.util.Collection;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import rule.engine.org.app.domain.entity.security.UserAccount;
import rule.engine.org.app.domain.entity.security.UserRole;

/**
 * Spring Security {@link UserDetails} implementation for {@link UserAccount}.
 */
public class UserPrincipal implements UserDetails {

    private final UUID id;
    private final String email;
    private final String password;
    private final Collection<UserRole> roles;
    private final Instant createdAt;

    private UserPrincipal(UUID id, String email, String password, Collection<UserRole> roles, Instant createdAt) {
        this.id = id;
        this.email = email;
        this.password = password;
        this.roles = roles;
        this.createdAt = createdAt;
    }

    public static UserPrincipal from(UserAccount account) {
        return new UserPrincipal(
            account.getId(), 
            account.getEmail(), 
            account.getPassword(), 
            account.getRoles(),
            account.getCreatedAt()
        );
    }

    public UUID getId() {
        return id;
    }

    public Collection<UserRole> getRoles() {
        return roles;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return roles.stream()
                .map(role -> new SimpleGrantedAuthority("ROLE_" + role.name()))
                .collect(Collectors.toSet());
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}


