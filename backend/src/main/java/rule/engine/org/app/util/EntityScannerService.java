package rule.engine.org.app.util;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.stereotype.Service;
import rule.engine.org.app.domain.entity.ui.FactType;
import jakarta.persistence.Entity;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Service to scan and cache entity classes for DRL generation.
 * Automatically discovers entity classes in execution packages at startup.
 */
@Service
public class EntityScannerService {

    private static final Logger log = LoggerFactory.getLogger(EntityScannerService.class);

    // Base package for execution entities
    private static final String EXECUTION_BASE_PACKAGE = "rule.engine.org.app.domain.entity.execution";

    // Package mappings for each FactType
    private static final Map<FactType, String> FACT_TYPE_PACKAGES = Map.of(
            FactType.DECLARATION, EXECUTION_BASE_PACKAGE + ".declaration",
            FactType.CARGO_REPORT, EXECUTION_BASE_PACKAGE + ".cargo",
            FactType.TRAVELER, EXECUTION_BASE_PACKAGE + ".traveler"
    );

    // Required execution entity imports (always needed, not in sub-packages)
    private static final Set<String> REQUIRED_EXECUTION_IMPORTS = Set.of(
            "rule.engine.org.app.domain.entity.execution.RuleOutputHit",
            "rule.engine.org.app.domain.entity.execution.TotalRuleResults"
    );

    // Cached entity class names by FactType
    private final Map<FactType, List<String>> entityImportsByFactType = new HashMap<>();

    /**
     * Scan and cache entity classes at application startup.
     */
    @PostConstruct
    public void scanEntities() {
        log.info("Scanning entity classes for DRL generation...");

        ClassPathScanningCandidateComponentProvider scanner = 
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));

        // Scan required execution entities (base package)
        List<String> requiredEntities = scanPackage(EXECUTION_BASE_PACKAGE, scanner);
        log.debug("Found {} required execution entities in base package", requiredEntities.size());

        // Scan entities for each FactType
        for (Map.Entry<FactType, String> entry : FACT_TYPE_PACKAGES.entrySet()) {
            FactType factType = entry.getKey();
            String packageName = entry.getValue();
            
            List<String> entityImports = scanPackage(packageName, scanner);
            entityImportsByFactType.put(factType, entityImports);
            
            log.info("Found {} entity classes for FactType {} in package {}", 
                    entityImports.size(), factType, packageName);
        }

        log.info("Entity scanning completed. Total FactTypes: {}", entityImportsByFactType.size());
    }

    /**
     * Scan a package for entity classes.
     *
     * @param packageName Package to scan
     * @param scanner Scanner instance
     * @return List of fully qualified class names
     */
    private List<String> scanPackage(String packageName, 
                                     ClassPathScanningCandidateComponentProvider scanner) {
        Set<BeanDefinition> candidates = scanner.findCandidateComponents(packageName);
        return candidates.stream()
                .map(BeanDefinition::getBeanClassName)
                .filter(Objects::nonNull)
                .sorted()
                .collect(Collectors.toList());
    }

    /**
     * Get entity imports for a specific FactType.
     *
     * @param factType The fact type
     * @return List of fully qualified class names for entities
     */
    public List<String> getEntityImports(FactType factType) {
        return entityImportsByFactType.getOrDefault(factType, Collections.emptyList());
    }

    /**
     * Get required execution entity imports (always needed).
     *
     * @return List of required entity class names
     */
    public List<String> getRequiredExecutionImports() {
        return new ArrayList<>(REQUIRED_EXECUTION_IMPORTS);
    }

    /**
     * Get all entity imports for a FactType including required ones.
     *
     * @param factType The fact type
     * @return Combined list of required and fact-type-specific entity imports
     */
    public List<String> getAllEntityImports(FactType factType) {
        List<String> allImports = new ArrayList<>(getRequiredExecutionImports());
        allImports.addAll(getEntityImports(factType));
        return allImports;
    }

    /**
     * Get the main entity class for a FactType.
     * The main entity is the one whose simple name matches the FactType value.
     * 
     * @param factType The fact type
     * @return The main entity class, or null if not found
     */
    public Class<?> getMainEntityClass(FactType factType) {
        List<String> entityClassNames = getEntityImports(factType);
        String factTypeValue = factType.getValue();
        
        for (String className : entityClassNames) {
            try {
                Class<?> clazz = Class.forName(className);
                if (clazz.getSimpleName().equals(factTypeValue)) {
                    return clazz;
                }
            } catch (ClassNotFoundException e) {
                log.warn("Could not load entity class: {}", className, e);
            }
        }
        
        log.warn("Main entity class not found for FactType: {} (value: {})", factType, factTypeValue);
        return null;
    }

    /**
     * Get all entity classes for a FactType.
     * 
     * @param factType The fact type
     * @return List of entity classes
     */
    public List<Class<?>> getEntityClasses(FactType factType) {
        List<String> entityClassNames = getEntityImports(factType);
        List<Class<?>> classes = new ArrayList<>();
        
        for (String className : entityClassNames) {
            try {
                classes.add(Class.forName(className));
            } catch (ClassNotFoundException e) {
                log.warn("Could not load entity class: {}", className, e);
            }
        }
        
        return classes;
    }
}

