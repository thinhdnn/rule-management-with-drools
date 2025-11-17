package rule.engine.org.app.api.request;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for activating a historical KieContainer version
 * 
 * This allows switching to any previously deployed version
 * with two modes:
 * - CREATE_NEW: Create new version (increment) with rules from target version
 * - REBUILD: Replace current version with rules from target version (no increment)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ActivateVersionRequest {
    
    /**
     * Fact type for which to activate version (e.g., "Declaration", "CargoReport")
     */
    private String factType;
    
    /**
     * Whether to create a new version (increment) or rebuild current version
     * - true: Create new version (e.g., v5 -> v6 with rules from v3)
     * - false: Rebuild current version (e.g., v5 stays v5 but with rules from v3)
     */
    @Builder.Default
    private Boolean createNewVersion = true;
    
    /**
     * Optional notes about why this version is being activated
     * (e.g., "Rollback due to production issue", "Reactivating stable version")
     */
    private String activationNotes;
}
