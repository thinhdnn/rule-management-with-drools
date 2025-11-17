package rule.engine.org.app.domain.entity.ui;

/**
 * Enum representing the status of a rule
 * Replaces the boolean 'active' field for clearer semantics
 */
public enum RuleStatus {
    /**
     * Rule is a draft - not yet approved for deployment
     * Created rules start in this state
     */
    DRAFT("Draft"),
    
    /**
     * Rule is active - approved and can be deployed or is currently deployed
     * Rules in this state are included in KieContainer deployments
     */
    ACTIVE("Active"),
    
    /**
     * Rule is inactive - deactivated, excluded, or replaced by a newer version
     * Rules in this state are not deployed
     */
    INACTIVE("Inactive");
    
    private final String displayName;
    
    RuleStatus(String displayName) {
        this.displayName = displayName;
    }
    
    public String getDisplayName() {
        return displayName;
    }
    
    /**
     * Get RuleStatus from string value (case-insensitive)
     */
    public static RuleStatus fromValue(String value) {
        if (value == null) {
            return DRAFT;
        }
        for (RuleStatus status : values()) {
            if (status.name().equalsIgnoreCase(value)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Invalid RuleStatus: " + value);
    }
}

