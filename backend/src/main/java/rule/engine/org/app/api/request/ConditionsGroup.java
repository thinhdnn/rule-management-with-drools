package rule.engine.org.app.api.request;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * DTO for grouped conditions structure
 * Groups conditions by logical operator (AND/OR)
 * 
 * Rules:
 * - If only 1 condition total: can be null or use single field (no AND/OR needed)
 * - If 2+ conditions: must use AND/OR groups
 * 
 * Example with single condition:
 * null (no conditions object needed)
 * 
 * Example with multiple conditions:
 * {
 *   "OR": [
 *     {"field": "declaration.invoiceAmount", "operator": ">", "value": 150000},
 *     {"field": "declaration.countryOfExportId", "operator": "==", "value": "CN"}
 *   ],
 *   "AND": [
 *     {"field": "declaration.governmentAgencyGoodsItems.originCountryId", "operator": "==", "value": "CN"},
 *     {"field": "declaration.governmentAgencyGoodsItems.dutyRate", "operator": ">", "value": 15}
 *   ]
 * }
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ConditionsGroup {
    /**
     * Conditions that must ALL be true (AND)
     * Only include if there are 2+ AND conditions
     */
    @JsonProperty("AND")
    private List<Map<String, Object>> andConditions;
    
    /**
     * Conditions where at least ONE must be true (OR)
     * Only include if there are 2+ OR conditions
     */
    @JsonProperty("OR")
    private List<Map<String, Object>> orConditions;
    
    /**
     * Check if this group is empty
     */
    @JsonIgnore
    public boolean isEmpty() {
        return (andConditions == null || andConditions.isEmpty()) &&
               (orConditions == null || orConditions.isEmpty());
    }
    
    /**
     * Get all conditions as a flat list with logicalOp markers
     * Handles nested ConditionsGroup structures
     * Used for backward compatibility with existing code
     */
    public List<Map<String, Object>> toFlatList() {
        List<Map<String, Object>> result = new ArrayList<>();
        
        if (andConditions != null) {
            for (Object item : andConditions) {
                if (item instanceof Map) {
                    Map<String, Object> mapItem = (Map<String, Object>) item;
                    // Check if this is a nested ConditionsGroup (has "AND" or "OR" key)
                    if (mapItem.containsKey("AND") || mapItem.containsKey("OR")) {
                        // Recursively flatten nested group
                        ConditionsGroup nestedGroup = new ConditionsGroup();
                        if (mapItem.containsKey("AND")) {
                            nestedGroup.setAndConditions((List<Map<String, Object>>) mapItem.get("AND"));
                        }
                        if (mapItem.containsKey("OR")) {
                            nestedGroup.setOrConditions((List<Map<String, Object>>) mapItem.get("OR"));
                        }
                        List<Map<String, Object>> nestedFlat = nestedGroup.toFlatList();
                        // All nested conditions get "AND" logicalOp
                        for (Map<String, Object> nestedCond : nestedFlat) {
                            nestedCond.put("logicalOp", "AND");
                            result.add(nestedCond);
                        }
                    } else {
                        // Regular condition
                        Map<String, Object> condWithOp = new java.util.HashMap<>(mapItem);
                        condWithOp.put("logicalOp", "AND");
                        result.add(condWithOp);
                    }
                }
            }
        }
        
        if (orConditions != null) {
            for (Object item : orConditions) {
                if (item instanceof Map) {
                    Map<String, Object> mapItem = (Map<String, Object>) item;
                    // Check if this is a nested ConditionsGroup (has "AND" or "OR" key)
                    if (mapItem.containsKey("AND") || mapItem.containsKey("OR")) {
                        // Recursively flatten nested group
                        ConditionsGroup nestedGroup = new ConditionsGroup();
                        if (mapItem.containsKey("AND")) {
                            nestedGroup.setAndConditions((List<Map<String, Object>>) mapItem.get("AND"));
                        }
                        if (mapItem.containsKey("OR")) {
                            nestedGroup.setOrConditions((List<Map<String, Object>>) mapItem.get("OR"));
                        }
                        List<Map<String, Object>> nestedFlat = nestedGroup.toFlatList();
                        // All nested conditions get "OR" logicalOp
                        for (Map<String, Object> nestedCond : nestedFlat) {
                            nestedCond.put("logicalOp", "OR");
                            result.add(nestedCond);
                        }
                    } else {
                        // Regular condition
                        Map<String, Object> condWithOp = new java.util.HashMap<>(mapItem);
                        condWithOp.put("logicalOp", "OR");
                        result.add(condWithOp);
                    }
                }
            }
        }
        
        return result;
    }
}

