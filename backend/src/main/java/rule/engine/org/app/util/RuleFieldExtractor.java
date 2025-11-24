package rule.engine.org.app.util;

import jakarta.persistence.Column;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import org.springframework.stereotype.Component;
import rule.engine.org.app.api.response.RuleFieldMetadata.FieldDefinition;
import rule.engine.org.app.api.response.RuleFieldMetadata.OperatorDefinition;
import rule.engine.org.app.domain.entity.execution.RuleOutputHit;
import rule.engine.org.app.domain.entity.ui.FactType;

import java.lang.reflect.Field;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Extracts field metadata from entity classes using reflection.
 * Uses EntityScannerService to dynamically discover entity classes.
 */
@Component
public class RuleFieldExtractor {

    private static RuleFieldExtractor instance;
    private final EntityScannerService entityScannerService;

    public RuleFieldExtractor(EntityScannerService entityScannerService) {
        this.entityScannerService = entityScannerService;
        // Set static instance for backward compatibility with static methods
        instance = this;
    }

    /**
     * Get the singleton instance (for static method compatibility).
     */
    private static RuleFieldExtractor getInstance() {
        if (instance == null) {
            throw new IllegalStateException("RuleFieldExtractor not initialized. " +
                    "Ensure it is a Spring component and EntityScannerService is available.");
        }
        return instance;
    }

    /**
     * Automatically extract all input fields from entity using reflection based on fact type.
     * 
     * @param factType Fact type string (e.g., "Declaration", "CargoReport")
     * @return List of field definitions
     */
    public static List<FieldDefinition> extractInputFields(String factType) {
        FactType factTypeEnum;
        try {
            factTypeEnum = FactType.fromValue(factType);
        } catch (IllegalArgumentException e) {
            // Fallback to DECLARATION for backward compatibility
            factTypeEnum = FactType.DECLARATION;
        }
        return getInstance().extractInputFields(factTypeEnum);
    }

    /**
     * Automatically extract all input fields from entity using reflection based on fact type.
     * 
     * @param factType Fact type enum
     * @return List of field definitions
     */
    public List<FieldDefinition> extractInputFields(FactType factType) {
        List<FieldDefinition> fields = new ArrayList<>();
        
        // Get main entity class dynamically from EntityScannerService
        Class<?> entityClass = entityScannerService.getMainEntityClass(factType);
        if (entityClass == null) {
            throw new IllegalArgumentException("Main entity class not found for FactType: " + factType);
        }
        
        // Generate entity prefix from class name (camelCase)
        String entityPrefix = toCamelCase(entityClass.getSimpleName());
        
        // Get all declared fields from entity class
        Field[] declaredFields = entityClass.getDeclaredFields();
        
        for (Field field : declaredFields) {
            // Skip technical fields (id, createdAt, updatedAt, etc.)
            String fieldName = field.getName();
            if (shouldSkipField(fieldName)) {
                continue;
            }
            
            // Check for @Column annotation (regular fields)
            Column column = field.getAnnotation(Column.class);
            if (column != null) {
            // Determine field type
            String type = determineFieldType(field.getType());
                
                // Build field path with entity prefix: declaration.transportMeansId or cargoReport.transportMeansId
                String fieldPath = entityPrefix + "." + fieldName;
            
            // Generate human-readable label from field name
            String label = generateLabel(fieldName);
            
            // Generate description
                String description = generateDescription(fieldPath, type);
                
                fields.add(new FieldDefinition(fieldPath, label, type, description));
                continue;
            }
            
            // Check for @OneToMany annotation (relationship fields like governmentAgencyGoodsItems)
            OneToMany oneToMany = field.getAnnotation(OneToMany.class);
            if (oneToMany != null) {
                // Extract fields from the related entity (e.g., GovernmentAgencyGoodsItem)
                // Get the generic type from List<GovernmentAgencyGoodsItem>
                Type genericType = field.getGenericType();
                if (genericType instanceof ParameterizedType) {
                    ParameterizedType paramType = (ParameterizedType) genericType;
                    Type[] actualTypes = paramType.getActualTypeArguments();
                    if (actualTypes.length > 0 && actualTypes[0] instanceof Class) {
                        Class<?> relatedEntityClass = (Class<?>) actualTypes[0];
                        
                        // Extract fields from the related entity
                        Field[] relatedFields = relatedEntityClass.getDeclaredFields();
                        for (Field relatedField : relatedFields) {
                            String relatedFieldName = relatedField.getName();
                            
                            // Skip technical fields and back-references to parent entities
                            // Automatically detect ManyToOne relationships (back-references)
                            if (shouldSkipField(relatedFieldName) 
                                || isBackReferenceField(relatedField, entityClass)
                                || relatedField.getAnnotation(ManyToOne.class) != null) {
                                continue;
                            }
                            
                            // Check for @Column annotation
                            Column relatedColumn = relatedField.getAnnotation(Column.class);
                            if (relatedColumn != null) {
                                // Build field path with entity prefix: declaration.governmentAgencyGoodsItems.hsId or cargoReport.consignments.ucr
                                String fieldPath = entityPrefix + "." + fieldName + "." + relatedFieldName;
                                
                                // Determine field type
                                String type = determineFieldType(relatedField.getType());
                                
                                // Generate human-readable label
                                String label = generateLabel(fieldName) + " - " + generateLabel(relatedFieldName);
                                
                                // Generate description
                                String description = String.format("Field: %s (type: %s)", fieldPath, type);
                                
                                fields.add(new FieldDefinition(fieldPath, label, type, description));
                            }
                        }
                    }
                }
            }
        }
        
        return fields;
    }
    
    /**
     * Skip technical/internal fields that shouldn't be used in conditions
     */
    private static boolean shouldSkipField(String fieldName) {
        return fieldName.equals("id") 
            || fieldName.equals("createdAt") 
            || fieldName.equals("updatedAt") 
            || fieldName.equals("createdBy") 
            || fieldName.equals("updatedBy");
    }

    /**
     * Check if a field is a back-reference to a parent entity.
     * This automatically detects ManyToOne relationships that point back to the main entity.
     * 
     * @param field The field to check
     * @param mainEntityClass The main entity class
     * @return true if the field is a back-reference
     */
    private static boolean isBackReferenceField(Field field, Class<?> mainEntityClass) {
        ManyToOne manyToOne = field.getAnnotation(ManyToOne.class);
        if (manyToOne == null) {
            return false;
        }
        
        // Check if the field type matches the main entity class or its superclass
        Class<?> fieldType = field.getType();
        return fieldType.equals(mainEntityClass) 
            || mainEntityClass.isAssignableFrom(fieldType)
            || fieldType.isAssignableFrom(mainEntityClass);
    }

    /**
     * Convert PascalCase to camelCase.
     * Example: "Declaration" -> "declaration", "CargoReport" -> "cargoReport"
     */
    private static String toCamelCase(String pascalCase) {
        if (pascalCase == null || pascalCase.isEmpty()) {
            return pascalCase;
        }
        return pascalCase.substring(0, 1).toLowerCase() + pascalCase.substring(1);
    }
    
    /**
     * Map Java types to simplified type names for UI
     */
    private static String determineFieldType(Class<?> type) {
        if (type.equals(String.class)) {
            return "string";
        } else if (type.equals(Integer.class) || type.equals(int.class)) {
            return "integer";
        } else if (type.equals(BigDecimal.class) || type.equals(Double.class) 
                || type.equals(double.class) || type.equals(Float.class) || type.equals(float.class)) {
            return "decimal";
        } else if (type.equals(Boolean.class) || type.equals(boolean.class)) {
            return "boolean";
        } else if (type.equals(LocalDateTime.class)) {
            return "string"; // Treat datetime as string for now
        } else {
            return "string"; // default
        }
    }
    
    /**
     * Convert camelCase field name to Human Readable Label
     * e.g., totalInvoiceAmount -> Total Invoice Amount
     */
    private static String generateLabel(String fieldName) {
        // Split camelCase
        String result = fieldName.replaceAll("([A-Z])", " $1");
        // Capitalize first letter
        result = result.substring(0, 1).toUpperCase() + result.substring(1);
        return result.trim();
    }
    
    /**
     * Generate description for field
     */
    private static String generateDescription(String fieldName, String type) {
        // You can customize descriptions here or load from properties file
        return String.format("Field: %s (type: %s)", fieldName, type);
    }
    
    /**
     * Get operators grouped by field type
     * Returns a map of field type -> list of applicable operators
     */
    public static Map<String, List<OperatorDefinition>> getOperatorsByType() {
        Map<String, List<OperatorDefinition>> operators = new HashMap<>();
        
        // String operators
        operators.put("string", List.of(
            new OperatorDefinition("==", "Equal to", "Check if values are equal"),
            new OperatorDefinition("!=", "Not equal to", "Check if values are not equal"),
            new OperatorDefinition("contains", "Contains", "Check if string contains a substring"),
            new OperatorDefinition("startsWith", "Starts with", "Check if string starts with a prefix"),
            new OperatorDefinition("endsWith", "Ends with", "Check if string ends with a suffix"),
            new OperatorDefinition("matches", "Matches regex", "Check if string matches a regular expression")
        ));
        
        // Integer operators
        operators.put("integer", List.of(
            new OperatorDefinition("==", "Equal to", "Check if values are equal"),
            new OperatorDefinition("!=", "Not equal to", "Check if values are not equal"),
            new OperatorDefinition(">", "Greater than", "Check if value is greater than"),
            new OperatorDefinition(">=", "Greater than or equal to", "Check if value is greater than or equal to"),
            new OperatorDefinition("<", "Less than", "Check if value is less than"),
            new OperatorDefinition("<=", "Less than or equal to", "Check if value is less than or equal to")
        ));
        
        // Decimal operators (same as integer)
        operators.put("decimal", List.of(
            new OperatorDefinition("==", "Equal to", "Check if values are equal"),
            new OperatorDefinition("!=", "Not equal to", "Check if values are not equal"),
            new OperatorDefinition(">", "Greater than", "Check if value is greater than"),
            new OperatorDefinition(">=", "Greater than or equal to", "Check if value is greater than or equal to"),
            new OperatorDefinition("<", "Less than", "Check if value is less than"),
            new OperatorDefinition("<=", "Less than or equal to", "Check if value is less than or equal to")
        ));
        
        // Boolean operators
        operators.put("boolean", List.of(
            new OperatorDefinition("==", "Equal to", "Check if values are equal"),
            new OperatorDefinition("!=", "Not equal to", "Check if values are not equal")
        ));
        
        // Array/Collection operators (for relationship fields like governmentAgencyGoodsItems)
        operators.put("array", List.of(
            new OperatorDefinition("isEmpty", "Is empty", "Check if collection is empty"),
            new OperatorDefinition("isNotEmpty", "Is not empty", "Check if collection is not empty"),
            new OperatorDefinition("size", "Size", "Get size of collection"),
            new OperatorDefinition("contains", "Contains", "Check if collection contains an element")
        ));
        
        return operators;
    }
    
    /**
     * Extract all Java Class types used in entity fields for import generation.
     * This method scans all fields in the entity and related entities to collect
     * the actual Java types that need to be imported in DRL.
     * 
     * @param factType Fact type string (e.g., "Declaration", "CargoReport")
     * @return Set of Java Class types that need to be imported
     */
    public static java.util.Set<Class<?>> extractJavaTypesFromEntity(String factType) {
        FactType factTypeEnum;
        try {
            factTypeEnum = FactType.fromValue(factType);
        } catch (IllegalArgumentException e) {
            // Fallback to DECLARATION for backward compatibility
            factTypeEnum = FactType.DECLARATION;
        }
        return getInstance().extractJavaTypesFromEntity(factTypeEnum);
    }

    /**
     * Extract all Java Class types used in entity fields for import generation.
     * This method scans all fields in the entity and related entities to collect
     * the actual Java types that need to be imported in DRL.
     * 
     * @param factType Fact type enum
     * @return Set of Java Class types that need to be imported
     */
    public java.util.Set<Class<?>> extractJavaTypesFromEntity(FactType factType) {
        java.util.Set<Class<?>> types = new java.util.HashSet<>();
        
        // Get main entity class dynamically from EntityScannerService
        Class<?> entityClass = entityScannerService.getMainEntityClass(factType);
        if (entityClass == null) {
            throw new IllegalArgumentException("Main entity class not found for FactType: " + factType);
        }
        
        // Get all declared fields from entity class
        Field[] declaredFields = entityClass.getDeclaredFields();
        
        for (Field field : declaredFields) {
            String fieldName = field.getName();
            if (shouldSkipField(fieldName)) {
                continue;
            }
            
            // Check for @Column annotation (regular fields)
            Column column = field.getAnnotation(Column.class);
            if (column != null) {
                Class<?> fieldType = field.getType();
                addTypeIfNeedsImport(types, fieldType);
                continue;
            }
            
            // Check for @OneToMany annotation (relationship fields)
            OneToMany oneToMany = field.getAnnotation(OneToMany.class);
            if (oneToMany != null) {
                // Extract types from the related entity
                Type genericType = field.getGenericType();
                if (genericType instanceof ParameterizedType) {
                    ParameterizedType paramType = (ParameterizedType) genericType;
                    Type[] actualTypes = paramType.getActualTypeArguments();
                    if (actualTypes.length > 0 && actualTypes[0] instanceof Class) {
                        Class<?> relatedEntityClass = (Class<?>) actualTypes[0];
                        
                        // Add List type if it's a collection
                        types.add(List.class);
                        
                        // Extract fields from the related entity
                        Field[] relatedFields = relatedEntityClass.getDeclaredFields();
                        for (Field relatedField : relatedFields) {
                            String relatedFieldName = relatedField.getName();
                            
                            // Skip technical fields and back-references to parent entities
                            if (shouldSkipField(relatedFieldName) 
                                || isBackReferenceField(relatedField, entityClass)
                                || relatedField.getAnnotation(ManyToOne.class) != null) {
                                continue;
                            }
                            
                            Column relatedColumn = relatedField.getAnnotation(Column.class);
                            if (relatedColumn != null) {
                                Class<?> relatedFieldType = relatedField.getType();
                                addTypeIfNeedsImport(types, relatedFieldType);
                            }
                        }
                    }
                }
            }
        }
        
        return types;
    }
    
    /**
     * Add Java type to set if it needs to be imported (not a primitive or java.lang type)
     */
    private static void addTypeIfNeedsImport(java.util.Set<Class<?>> types, Class<?> type) {
        // Skip primitives and primitive wrappers (handled by Drools automatically)
        if (type.isPrimitive()) {
            return;
        }
        
        // Skip java.lang types (String, Integer, Long, Boolean, etc. - no import needed)
        String packageName = type.getPackage() != null ? type.getPackage().getName() : "";
        if (packageName.equals("java.lang")) {
            return;
        }
        
        // Add the type if it's from a package that requires import
        if (!packageName.isEmpty()) {
            types.add(type);
        }
    }
    
    /**
     * Automatically extract all output fields from RuleOutputHit entity using reflection.
     * These fields are used in the THEN section of rules (output/action fields).
     * @return List of field definitions with predefined order and descriptions
     */
    public static List<FieldDefinition> extractOutputFields() {
        List<FieldDefinition> fields = new ArrayList<>();
        
        // Get all declared fields from RuleOutputHit class
        Class<?> entityClass = RuleOutputHit.class;
        Field[] declaredFields = entityClass.getDeclaredFields();
        
        // Define order and descriptions for output fields
        Map<String, Integer> fieldOrder = Map.of(
            "action", 0,
            "score", 1,
            "result", 2,
            "flag", 3,
            "documentType", 4,
            "documentId", 5,
            "description", 6
        );
        
        Map<String, String> fieldDescriptions = Map.of(
            "action", "Action to take when rule matches (FLAG, APPROVE, REJECT, REVIEW, HOLD)",
            "score", "Risk score contributed by this output (0-100)",
            "result", "Result message/description to display",
            "flag", "Optional flag label/category (e.g., HIGH_RISK, SUSPICIOUS)",
            "documentType", "Optional related document type (e.g., INVOICE, LICENSE)",
            "documentId", "Optional related document identifier",
            "description", "Optional longer description for reporting"
        );
        
        for (Field field : declaredFields) {
            String fieldName = field.getName();
            
            // Determine field type
            String type = determineFieldType(field.getType());
            
            // Generate human-readable label
            String label = generateLabel(fieldName);
            
            // Get description from predefined map or generate default
            String description = fieldDescriptions.getOrDefault(fieldName, 
                String.format("Field: %s (type: %s)", fieldName, type));
            
            // Get order index from predefined map
            Integer orderIndex = fieldOrder.getOrDefault(fieldName, Integer.MAX_VALUE);
            
            fields.add(new FieldDefinition(fieldName, label, type, description, orderIndex));
        }
        
        // Sort by orderIndex to ensure consistent display order
        fields.sort((a, b) -> {
            int orderA = a.getOrderIndex() != null ? a.getOrderIndex() : Integer.MAX_VALUE;
            int orderB = b.getOrderIndex() != null ? b.getOrderIndex() : Integer.MAX_VALUE;
            return Integer.compare(orderA, orderB);
        });
        
        return fields;
    }
}

