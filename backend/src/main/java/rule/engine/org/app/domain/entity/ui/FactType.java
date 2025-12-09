package rule.engine.org.app.domain.entity.ui;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Enum for fact type values
 * Represents different types of business entities that rules can be applied to
 */
public enum FactType {
    DECLARATION("Declaration"),
    CARGO_REPORT("CargoReport"),
    TRAVELER("Traveler");
    
    private final String value;
    
    FactType(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    @JsonCreator
    public static FactType fromValue(String value) {
        for (FactType type : values()) {
            if (type.value.equalsIgnoreCase(value) || type.name().equalsIgnoreCase(value)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown FactType: " + value);
    }
    

}

