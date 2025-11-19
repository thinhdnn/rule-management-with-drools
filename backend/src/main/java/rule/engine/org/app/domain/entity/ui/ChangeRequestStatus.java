package rule.engine.org.app.domain.entity.ui;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Enum for ChangeRequest status values
 */
public enum ChangeRequestStatus {
    PENDING("Pending"),
    APPROVED("Approved"),
    REJECTED("Rejected"),
    CANCELLED("Cancelled");
    
    private final String value;
    
    ChangeRequestStatus(String value) {
        this.value = value;
    }
    
    /**
     * Get string value for JSON serialization
     */
    @JsonValue
    public String getValue() {
        return value;
    }
    
    /**
     * Convert string value to enum for JSON deserialization
     */
    @JsonCreator
    public static ChangeRequestStatus fromValue(String value) {
        if (value == null) {
            return PENDING;
        }
        for (ChangeRequestStatus status : values()) {
            if (status.value.equalsIgnoreCase(value)) {
                return status;
            }
        }
        return PENDING; // Default
    }
}

