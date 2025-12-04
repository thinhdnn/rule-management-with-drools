package rule.engine.org.app.domain.service;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import rule.engine.org.app.api.request.CreateRuleRequest;
import rule.engine.org.app.api.request.ConditionsGroup;
import rule.engine.org.app.api.response.RuleFieldMetadata.FieldDefinition;
import rule.engine.org.app.api.response.RuleFieldMetadata.OperatorDefinition;
import rule.engine.org.app.util.RuleFieldExtractor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Service for validating AI-generated rules against metadata constraints.
 * Ensures that fields, operators, and values conform to the system's schema.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AIRuleValidationService {
    
    /**
     * Validation result containing errors, warnings, and auto-corrections
     */
    @Data
    @AllArgsConstructor
    public static class ValidationResult {
        private boolean valid;
        private List<String> errors;
        private List<String> warnings;
        private List<String> autoCorrected;
        
        public ValidationResult() {
            this.errors = new ArrayList<>();
            this.warnings = new ArrayList<>();
            this.autoCorrected = new ArrayList<>();
            this.valid = true;
        }
        
        public void addError(String error) {
            this.errors.add(error);
            this.valid = false;
        }
        
        public void addWarning(String warning) {
            this.warnings.add(warning);
        }
        
        public void addAutoCorrection(String correction) {
            this.autoCorrected.add(correction);
        }
    }
    
    /**
     * Validate a generated rule against metadata constraints
     * @param rule The generated rule to validate
     * @param factType The fact type (Declaration, CargoReport, etc.)
     * @return ValidationResult with detailed errors, warnings, and suggestions
     */
    public ValidationResult validateRule(CreateRuleRequest rule, String factType) {
        ValidationResult result = new ValidationResult();
        
        try {
            // Get metadata for the specified fact type
            List<FieldDefinition> inputFields = RuleFieldExtractor.extractInputFields(factType);
            List<FieldDefinition> outputFields = RuleFieldExtractor.extractOutputFields();
            Map<String, List<OperatorDefinition>> operatorsByType = RuleFieldExtractor.getOperatorsByType();
            
            // Validate rule name
            if (rule.getRuleName() == null || rule.getRuleName().trim().isEmpty()) {
                result.addError("Rule name is required");
            }
            
            // Validate fact type
            if (rule.getFactType() == null) {
                result.addError("Fact type is required");
            }
            
            // Validate conditions (WHEN section)
            if (rule.getConditions() == null || rule.getConditions().isEmpty()) {
                result.addError("At least one condition is required");
            } else {
                validateConditionsGroup(rule.getConditions(), inputFields, operatorsByType, result);
            }
            
            // Validate outputs (THEN section)
            if (rule.getOutput() == null || rule.getOutput().isEmpty()) {
                result.addError("At least one output is required");
            } else {
                validateOutput(rule.getOutput(), outputFields, result);
            }
            
            log.info("Validation completed for rule '{}': valid={}, errors={}, warnings={}", 
                rule.getRuleName(), result.isValid(), result.getErrors().size(), result.getWarnings().size());
            
        } catch (Exception e) {
            log.error("Error during rule validation", e);
            result.addError("Validation failed: " + e.getMessage());
        }
        
        return result;
    }
    
    /**
     * Validate condition fields and operators from ConditionsGroup
     * Handles nested structure where items in AND/OR arrays are nested groups
     */
    private void validateConditionsGroup(
        ConditionsGroup conditionsGroup,
        List<FieldDefinition> availableFields,
        Map<String, List<OperatorDefinition>> operatorsByType,
        ValidationResult result
    ) {
        // Collect all conditions from AND and OR groups, handling nested structure
        List<Map<String, Object>> allConditions = new ArrayList<>();
        
        if (conditionsGroup.getAndConditions() != null) {
            extractConditionsFromItems(conditionsGroup.getAndConditions(), allConditions);
        }
        
        if (conditionsGroup.getOrConditions() != null) {
            extractConditionsFromItems(conditionsGroup.getOrConditions(), allConditions);
        }
        
        // Validate all conditions
        validateConditions(allConditions, availableFields, operatorsByType, result);
    }
    
    /**
     * Extract conditions from items (handles both nested groups and direct conditions)
     */
    @SuppressWarnings("unchecked")
    private void extractConditionsFromItems(List<Map<String, Object>> items, List<Map<String, Object>> allConditions) {
        for (Object item : items) {
            if (item instanceof Map) {
                Map<String, Object> itemMap = (Map<String, Object>) item;
                // Check if this is a nested group (has "AND" or "OR" key)
                if (itemMap.containsKey("AND") || itemMap.containsKey("OR")) {
                    // Extract conditions from nested group
                    List<Map<String, Object>> nestedConditions = null;
                    if (itemMap.containsKey("AND")) {
                        Object andObj = itemMap.get("AND");
                        if (andObj instanceof List) {
                            nestedConditions = (List<Map<String, Object>>) andObj;
                        }
                    } else if (itemMap.containsKey("OR")) {
                        Object orObj = itemMap.get("OR");
                        if (orObj instanceof List) {
                            nestedConditions = (List<Map<String, Object>>) orObj;
                        }
                    }
                    if (nestedConditions != null) {
                        allConditions.addAll(nestedConditions);
                    }
                } else if (itemMap.containsKey("field") && itemMap.containsKey("operator") && itemMap.containsKey("value")) {
                    // Direct condition (backward compatibility)
                    allConditions.add(itemMap);
                }
            }
        }
    }
    
    /**
     * Validate condition fields and operators
     */
    private void validateConditions(
        List<Map<String, Object>> conditions,
        List<FieldDefinition> availableFields,
        Map<String, List<OperatorDefinition>> operatorsByType,
        ValidationResult result
    ) {
        for (int i = 0; i < conditions.size(); i++) {
            Map<String, Object> condition = conditions.get(i);
            String prefix = "Condition #" + (i + 1);
            
            // Extract field, operator, value from map
            String field = (String) condition.get("field");
            String operator = (String) condition.get("operator");
            Object value = condition.get("value");
            
            // Validate field exists
            if (field == null || field.trim().isEmpty()) {
                result.addError(prefix + ": Field name is required");
                continue;
            }
            
            Optional<FieldDefinition> fieldDefOpt = findField(field, availableFields);
            if (fieldDefOpt.isEmpty()) {
                result.addError(prefix + ": Field '" + field + "' does not exist. " +
                    "Available fields must be from metadata endpoint.");
                
                // Suggest similar fields
                List<String> suggestions = findSimilarFields(field, availableFields);
                if (!suggestions.isEmpty()) {
                    result.addWarning(prefix + ": Did you mean one of these? " + String.join(", ", suggestions));
                }
                continue;
            }
            
            FieldDefinition fieldDef = fieldDefOpt.get();
            
            // Validate operator
            if (operator == null || operator.trim().isEmpty()) {
                result.addError(prefix + ": Operator is required");
                continue;
            }
            
            if (!isOperatorValidForType(operator, fieldDef.getType(), operatorsByType)) {
                result.addError(prefix + ": Operator '" + operator + 
                    "' is not valid for field type '" + fieldDef.getType() + "'");
                
                // Suggest valid operators
                List<String> validOps = getValidOperatorsForType(fieldDef.getType(), operatorsByType);
                if (!validOps.isEmpty()) {
                    result.addWarning(prefix + ": Valid operators for type '" + fieldDef.getType() + 
                        "': " + String.join(", ", validOps));
                }
            }
            
            // Validate value is provided (except for IS_NULL/IS_NOT_NULL operators)
            if (!operator.equalsIgnoreCase("isNull") && 
                !operator.equalsIgnoreCase("isNotNull")) {
                String valueStr = value != null ? value.toString() : null;
                if (valueStr == null || valueStr.trim().isEmpty()) {
                    result.addError(prefix + ": Value is required for operator '" + operator + "'");
                }
            }
        }
    }
    
    /**
     * Validate output fields (single output object)
     */
    private void validateOutput(
        Map<String, Object> output,
        List<FieldDefinition> availableOutputFields,
        ValidationResult result
    ) {
        String prefix = "Output";
        
        // Check that at least one output field is populated
        boolean hasAnyField = false;
        
        Object action = output.get("action");
        if (action != null && !action.toString().trim().isEmpty()) {
            hasAnyField = true;
            validateOutputField("action", action.toString(), availableOutputFields, prefix, result);
        }
        
        Object resultObj = output.get("result");
        if (resultObj != null && !resultObj.toString().trim().isEmpty()) {
            hasAnyField = true;
            validateOutputField("result", resultObj.toString(), availableOutputFields, prefix, result);
        }
        
        Object score = output.get("score");
        if (score != null) {
            hasAnyField = true;
            // Validate score range (0-100)
            try {
                double scoreValue = Double.parseDouble(score.toString());
                if (scoreValue < 0 || scoreValue > 100) {
                    result.addWarning(prefix + ": Score should be between 0 and 100");
                }
            } catch (NumberFormatException e) {
                result.addError(prefix + ": Score must be a number");
            }
        }
        
        Object flag = output.get("flag");
        if (flag != null && !flag.toString().trim().isEmpty()) {
            hasAnyField = true;
        }
        
        Object description = output.get("description");
        if (description != null && !description.toString().trim().isEmpty()) {
            hasAnyField = true;
        }
        
        if (!hasAnyField) {
            result.addError(prefix + ": At least one output field (action, result, score, etc.) must be specified");
        }
    }
    
    /**
     * Validate a specific output field
     */
    private void validateOutputField(
        String fieldName,
        String fieldValue,
        List<FieldDefinition> availableOutputFields,
        String prefix,
        ValidationResult result
    ) {
        boolean fieldExists = availableOutputFields.stream()
            .anyMatch(f -> f.getName().equalsIgnoreCase(fieldName));
        
        if (!fieldExists) {
            result.addError(prefix + ": Output field '" + fieldName + "' is not available in metadata");
        }
    }
    
    /**
     * Find a field definition by name
     */
    private Optional<FieldDefinition> findField(String fieldName, List<FieldDefinition> fields) {
        return fields.stream()
            .filter(f -> f.getName().equalsIgnoreCase(fieldName))
            .findFirst();
    }
    
    /**
     * Find similar field names (for suggestions)
     */
    private List<String> findSimilarFields(String fieldName, List<FieldDefinition> fields) {
        String lowerFieldName = fieldName.toLowerCase();
        return fields.stream()
            .filter(f -> {
                String lowerName = f.getName().toLowerCase();
                // Check if field name contains or is contained by the search term
                return lowerName.contains(lowerFieldName) || lowerFieldName.contains(lowerName);
            })
            .limit(3)
            .map(FieldDefinition::getName)
            .toList();
    }
    
    /**
     * Check if operator is valid for field type
     */
    private boolean isOperatorValidForType(
        String operator,
        String fieldType,
        Map<String, List<OperatorDefinition>> operatorsByType
    ) {
        List<OperatorDefinition> validOperators = operatorsByType.get(fieldType);
        if (validOperators == null) {
            return false;
        }
        
        return validOperators.stream()
            .anyMatch(op -> op.getOperator().equalsIgnoreCase(operator));
    }
    
    /**
     * Get list of valid operators for a field type
     */
    private List<String> getValidOperatorsForType(
        String fieldType,
        Map<String, List<OperatorDefinition>> operatorsByType
    ) {
        List<OperatorDefinition> validOperators = operatorsByType.get(fieldType);
        if (validOperators == null) {
            return List.of();
        }
        
        return validOperators.stream()
            .map(op -> op.getOperator() + " (" + op.getLabel() + ")")
            .toList();
    }
}

