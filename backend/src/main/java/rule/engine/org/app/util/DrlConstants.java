package rule.engine.org.app.util;

import rule.engine.org.app.domain.entity.ui.FactType;

import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Constants for Drools Rule Language (DRL) generation.
 * Entity imports are automatically scanned at startup via EntityScannerService.
 */
public class DrlConstants {
    
    // Package name for DRL rules
    public static final String DRL_PACKAGE = "rules";
    
    // Global declarations for DRL rules
    public static final String[] DRL_GLOBALS = {
        "TotalRuleResults totalResults"
    };
    
    // Entity scanner service (injected at startup via DrlConstantsConfig)
    private static EntityScannerService entityScannerService;
    
    /**
     * Set the entity scanner service (called by DrlConstantsConfig at startup).
     * 
     * @param scannerService The entity scanner service instance
     */
    public static void setEntityScannerService(EntityScannerService scannerService) {
        entityScannerService = scannerService;
    }
    
    /**
     * Build DRL header (package, imports, globals) based on factType.
     * Automatically extracts Java types from entity fields and imports only what's needed.
     * Entity imports are dynamically scanned at startup, not hardcoded.
     * 
     * @param factType The fact type to determine which imports to include
     * @return DRL header string with package, imports, and globals
     */
    public static String buildDrlHeader(FactType factType) {
        StringBuilder header = new StringBuilder();
        
        // Package declaration
        header.append("package ").append(DRL_PACKAGE).append("\n\n");
        
        // Build imports list based on factType
        Set<String> imports = new TreeSet<>(); // Use TreeSet for sorted, unique imports
        
        // Add entity imports from scanner (if available)
        if (entityScannerService != null) {
            List<String> entityImports = entityScannerService.getAllEntityImports(factType);
            imports.addAll(entityImports);
        } else {
            // Fallback: log warning if scanner not initialized
            System.err.println("WARNING: EntityScannerService not initialized. " +
                    "Entity imports may be missing. Ensure DrlConstantsConfig is loaded.");
        }
        
        // Extract Java types from entity fields and add their imports
        Set<Class<?>> javaTypes = RuleFieldExtractor.extractJavaTypesFromEntity(factType.getValue());
        for (Class<?> type : javaTypes) {
            String importString = type.getName();
            imports.add(importString);
        }
        
        // Write imports (sorted alphabetically)
        for (String importClass : imports) {
            header.append("import ").append(importClass).append("\n");
        }
        header.append("\n");
        
        // Global declarations
        for (String global : DRL_GLOBALS) {
            header.append("global ").append(global).append("\n");
        }
        header.append("\n");
        
        return header.toString();
    }
    
    /**
     * Build DRL header (package, imports, globals) - deprecated, use buildDrlHeader(FactType) instead
     * Defaults to DECLARATION for backward compatibility
     * 
     * @deprecated Use buildDrlHeader(FactType) instead
     */
    @Deprecated
    public static String buildDrlHeader() {
        return buildDrlHeader(FactType.DECLARATION);
    }
    
    private DrlConstants() {
        // Utility class - prevent instantiation
    }
}

