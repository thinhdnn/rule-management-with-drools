package rule.engine.org.app.domain.service;

import org.kie.api.KieServices;
import org.kie.api.builder.KieBuilder;
import org.kie.api.builder.KieFileSystem;
import org.kie.api.builder.KieModule;
import org.kie.api.runtime.KieContainer;
import org.kie.api.runtime.StatelessKieSession;
import org.springframework.stereotype.Service;
import rule.engine.org.app.domain.entity.ui.DecisionRule;
import rule.engine.org.app.domain.entity.ui.FactType;
import rule.engine.org.app.domain.entity.execution.declaration.Declaration;
import rule.engine.org.app.domain.entity.execution.RuleOutputHit;
import rule.engine.org.app.domain.entity.execution.TotalRuleResults;
import rule.engine.org.app.domain.repository.DecisionRuleRepository;
import rule.engine.org.app.domain.repository.KieContainerVersionRepository;
import rule.engine.org.app.domain.entity.ui.KieContainerVersion;
import rule.engine.org.app.util.DrlConstants;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.stream.Collectors;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class RuleEngineManager {
    
    private final DecisionRuleRepository decisionRuleRepository;
    private final KieContainerVersionRepository containerVersionRepository;
    private final ReadWriteLock lock = new ReentrantReadWriteLock();
    
    // Map to store containers by fact type
    private final Map<String, ContainerInfo> containers = new ConcurrentHashMap<>();
    
    /**
     * Container information for a specific fact type
     */
    private static class ContainerInfo {
        final KieContainer container;
        final KieModule kieModule;
        volatile long version;
        volatile String lastRulesHash;
        
        ContainerInfo(KieContainer container, KieModule kieModule, long version, String lastRulesHash) {
            this.container = container;
            this.kieModule = kieModule;
            this.version = version;
            this.lastRulesHash = lastRulesHash;
        }
    }
    
    public RuleEngineManager(
            DecisionRuleRepository decisionRuleRepository,
            KieContainerVersionRepository containerVersionRepository) {
        this.decisionRuleRepository = decisionRuleRepository;
        this.containerVersionRepository = containerVersionRepository;
        
        // Load all fact types and build containers
        initializeContainers();
    }
    
    /**
     * Initialize containers for all fact types
     */
    private void initializeContainers() {
        lock.writeLock().lock();
        try {
            // Get all distinct fact types
            List<FactType> factTypes = decisionRuleRepository.findDistinctFactTypes();
            if (factTypes.isEmpty()) {
                // Default to "Declaration" if no fact types found
                factTypes = Collections.singletonList(FactType.DECLARATION);
            }
            
            // Build container for each fact type
            for (FactType factType : factTypes) {
                rebuildRulesForFactType(factType.getValue(), false);
            }
        } finally {
            lock.writeLock().unlock();
        }
    }
    
    /**
     * Rebuild rules for all fact types without incrementing version (for refresh)
     */
    public void rebuildRules() {
        lock.writeLock().lock();
        try {
            List<String> factTypes = new ArrayList<>(containers.keySet());
            if (factTypes.isEmpty()) {
                List<FactType> factTypeEnums = decisionRuleRepository.findDistinctFactTypes();
                if (factTypeEnums.isEmpty()) {
                    factTypes = Collections.singletonList(FactType.DECLARATION.getValue());
                } else {
                    factTypes = factTypeEnums.stream()
                        .map(FactType::getValue)
                        .collect(Collectors.toList());
                }
            }
            
            for (String factType : factTypes) {
                rebuildRulesForFactType(factType, false);
            }
        } finally {
            lock.writeLock().unlock();
        }
    }
    
    /**
     * Rebuild rules for a specific fact type without incrementing version (for refresh)
     */
    public void rebuildRules(String factType) {
        rebuildRulesForFactType(factType, false);
    }
    
    /**
     * Deploy rules for all fact types with version increment (for deploy)
     */
    public void deployRules() {
        lock.writeLock().lock();
        try {
            List<String> factTypes = new ArrayList<>(containers.keySet());
            if (factTypes.isEmpty()) {
                List<FactType> factTypeEnums = decisionRuleRepository.findDistinctFactTypes();
                if (factTypeEnums.isEmpty()) {
                    factTypes = Collections.singletonList(FactType.DECLARATION.getValue());
                } else {
                    factTypes = factTypeEnums.stream()
                        .map(FactType::getValue)
                        .collect(Collectors.toList());
                }
            }
            
            for (String factType : factTypes) {
                rebuildRulesForFactType(factType, true);
            }
        } finally {
            lock.writeLock().unlock();
        }
    }
    
    /**
     * Deploy rules for a specific fact type with version increment (for deploy)
     */
    public void deployRules(String factType) {
        rebuildRulesForFactType(factType, true);
    }
    
    /**
     * Internal method to rebuild rules for a specific fact type with optional version increment
     */
    private void rebuildRulesForFactType(String factType, boolean incrementVersion) {
        lock.writeLock().lock();
        try {
            // Load latest active rules for this fact type
            FactType factTypeEnum = FactType.fromValue(factType);
            List<DecisionRule> rules = decisionRuleRepository
                .findByFactTypeAndIsLatestTrueAndActiveTrueOrderByPriorityAsc(factTypeEnum);
            
            // Calculate hash of current rules to detect changes
            String currentRulesHash = calculateRulesHash(rules);
            
            // Get or create container info
            ContainerInfo containerInfo = containers.get(factType);
            long currentVersion = 0;
            String lastHash = null;
            
            if (containerInfo != null) {
                currentVersion = containerInfo.version;
                lastHash = containerInfo.lastRulesHash;
            } else {
                // Load latest version from database
                Optional<KieContainerVersion> latestVersion = containerVersionRepository
                    .findLatestVersionByFactType(factType);
                if (latestVersion.isPresent()) {
                    currentVersion = latestVersion.get().getVersion();
                    lastHash = latestVersion.get().getRulesHash();
                }
            }
            
            // Build list of rule IDs
            String ruleIds = rules.stream()
                .map(rule -> rule.getId().toString())
                .reduce((a, b) -> a + "," + b)
                .orElse("");
            
            // Determine if this is a new version (rules changed or first deploy)
            boolean isNewVersion = lastHash == null || !lastHash.equals(currentRulesHash);
            
            // Only increment version if deploying (not refreshing)
            if (incrementVersion) {
                currentVersion++;
                lastHash = currentRulesHash;
            }
            
            KieContainerBuildResult buildResult = buildKieContainer(rules, factType, currentVersion);
            
            // Atomic swap
            ContainerInfo oldInfo = containers.get(factType);
            ContainerInfo newInfo = new ContainerInfo(
                buildResult.container,
                buildResult.kieModule,
                currentVersion,
                lastHash
            );
            containers.put(factType, newInfo);
            
            // Cleanup old container
            if (oldInfo != null && oldInfo.container != null) {
                oldInfo.container.dispose();
            }
            
            // Only save version to database if deploying
            if (incrementVersion) {
                // Save version to database
                KieContainerVersion versionEntity = new KieContainerVersion();
                versionEntity.setFactType(factTypeEnum);
                versionEntity.setVersion(currentVersion);
                versionEntity.setRulesCount(rules.size());
                versionEntity.setRulesHash(currentRulesHash);
                versionEntity.setReleaseId(buildResult.kieModule.getReleaseId().toString());
                versionEntity.setRuleIds(ruleIds);
                
                // Generate changes description
                String changesDescription = generateChangesDescription(factTypeEnum.getValue(), rules, currentVersion, isNewVersion);
                versionEntity.setChangesDescription(changesDescription);
                
                // Generate detailed rule changes (added, removed, updated)
                String ruleChangesJson = generateRuleChangesJson(factTypeEnum.getValue(), rules, currentVersion);
                versionEntity.setRuleChangesJson(ruleChangesJson);
                
                containerVersionRepository.save(versionEntity);
                
                // Verify container after deployment
                try {
                    StatelessKieSession testSession = buildResult.container.newStatelessKieSession();
                    // Execute a no-op command to validate session usability
                    testSession.execute(java.util.Collections.emptyList());
                    org.kie.api.KieBase kieBase = buildResult.container.getKieBase();
                    int ruleCount = kieBase != null ? kieBase.getKiePackages().stream()
                        .mapToInt(pkg -> pkg.getRules().size())
                        .sum() : 0;
                    
                    // Log deploy with version and release ID
                    System.out.println("[RULE ENGINE] ✓ Deployed " + factType + " v" + currentVersion + " with " + rules.size() + " rules");
                    System.out.println("[RULE ENGINE]   ReleaseId: " + buildResult.kieModule.getReleaseId());
                    System.out.println("[RULE ENGINE]   Hash: " + currentRulesHash.substring(0, 8) + "...");
                    System.out.println("[RULE ENGINE]   ✓ Container verified: " + ruleCount + " rules loaded in KieBase");
                    System.out.println("[RULE ENGINE]   ✓ Session creation test: PASSED");
                } catch (Exception e) {
                    System.err.println("[RULE ENGINE] ✗ WARNING: Container deployed but verification failed: " + e.getMessage());
                    e.printStackTrace();
                }
            } else {
                // Log refresh without version increment
                System.out.println("[RULE ENGINE] Refreshed " + factType + " with " + rules.size() + " rules (ReleaseId: " + buildResult.kieModule.getReleaseId() + ", Hash: " + currentRulesHash.substring(0, 8) + "...)");
            }
        } finally {
            lock.writeLock().unlock();
        }
    }
    
    /**
     * Calculate hash of rules to detect changes
     * Hash is based on rule IDs, ruleContent, priority, and active status
     */
    private String calculateRulesHash(List<DecisionRule> rules) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            
            // Build hash input from rule properties
            StringBuilder hashInput = new StringBuilder();
            for (DecisionRule rule : rules) {
                hashInput.append(rule.getId()).append(":");
                hashInput.append(rule.getRuleContent() != null ? rule.getRuleContent() : "").append(":");
                hashInput.append(rule.getPriority()).append(":");
                hashInput.append(rule.getActive()).append("|");
            }
            
            // Calculate MD5 hash
            byte[] hashBytes = md.digest(hashInput.toString().getBytes());
            StringBuilder hash = new StringBuilder();
            for (byte b : hashBytes) {
                hash.append(String.format("%02x", b));
            }
            
            return hash.toString();
        } catch (Exception e) {
            // Fallback: use timestamp if hash calculation fails
            return String.valueOf(System.currentTimeMillis());
        }
    }
    
    /**
     * Generate description of changes in this version
     */
    private String generateChangesDescription(String factType, List<DecisionRule> rules, long currentVersion, boolean isNewVersion) {
        if (!isNewVersion) {
            return "No changes detected (same rules hash)";
        }
        
        // Compare with previous version if available
        Optional<KieContainerVersion> previousVersion = containerVersionRepository
            .findLatestVersionByFactType(factType);
        if (previousVersion.isPresent() && previousVersion.get().getVersion() < currentVersion) {
            KieContainerVersion prev = previousVersion.get();
            int prevCount = prev.getRulesCount() != null ? prev.getRulesCount() : 0;
            int currentCount = rules.size();
            
            if (currentCount > prevCount) {
                return String.format("Added %d rule(s) (from %d to %d rules)", 
                    currentCount - prevCount, prevCount, currentCount);
            } else if (currentCount < prevCount) {
                return String.format("Removed %d rule(s) (from %d to %d rules)", 
                    prevCount - currentCount, prevCount, currentCount);
            } else {
                return "Rules updated (same count, different content)";
            }
        }
        
        // First version or no previous version
        return String.format("Initial deployment with %d rule(s)", rules.size());
    }
    
    /**
     * Generate detailed JSON of rule changes (added, removed, updated)
     * Includes rule IDs and rule names
     * Compares rules by logical ID (parentRuleId or id if no parent) to handle versioning
     */
    private String generateRuleChangesJson(String factType, List<DecisionRule> currentRules, long currentVersion) {
        try {
            Map<String, Object> changes = new HashMap<>();
            List<Map<String, Object>> added = new ArrayList<>();
            List<Map<String, Object>> removed = new ArrayList<>();
            List<Map<String, Object>> updated = new ArrayList<>();
            
            // Helper function to get logical ID (parentRuleId or id if no parent)
            java.util.function.Function<DecisionRule, Long> getLogicalId = rule -> 
                rule.getParentRuleId() != null ? rule.getParentRuleId() : rule.getId();
            
            // Build maps: logicalId -> (actual rule, rule name)
            Map<Long, DecisionRule> currentRulesByLogicalId = new HashMap<>();
            Map<Long, String> currentRuleNames = new HashMap<>();
            Map<Long, Long> currentLogicalToActualId = new HashMap<>();
            
            for (DecisionRule rule : currentRules) {
                Long logicalId = getLogicalId.apply(rule);
                currentRulesByLogicalId.put(logicalId, rule);
                currentRuleNames.put(logicalId, rule.getRuleName() != null ? rule.getRuleName() : "Unnamed Rule");
                currentLogicalToActualId.put(logicalId, rule.getId());
            }
            
            Set<Long> currentLogicalIds = currentRulesByLogicalId.keySet();
            
            // Get previous version if available
            Optional<KieContainerVersion> previousVersion = containerVersionRepository
                .findLatestVersionByFactType(factType);
            if (previousVersion.isPresent() && previousVersion.get().getVersion() < currentVersion) {
                KieContainerVersion prev = previousVersion.get();
                String prevRuleIds = prev.getRuleIds();
                
                if (prevRuleIds != null && !prevRuleIds.isEmpty()) {
                    Set<Long> prevRuleIdsSet = Arrays.stream(prevRuleIds.split(","))
                        .filter(s -> !s.isEmpty())
                        .map(Long::parseLong)
                        .collect(Collectors.toSet());
                    
                    // Load previous rules to get their logical IDs
                    List<DecisionRule> prevRules = decisionRuleRepository.findAllById(prevRuleIdsSet);
                    Map<Long, DecisionRule> prevRulesByLogicalId = new HashMap<>();
                    Map<Long, String> prevRuleNames = new HashMap<>();
                    Map<Long, Long> prevLogicalToActualId = new HashMap<>();
                    
                    for (DecisionRule rule : prevRules) {
                        Long logicalId = getLogicalId.apply(rule);
                        prevRulesByLogicalId.put(logicalId, rule);
                        prevRuleNames.put(logicalId, rule.getRuleName() != null ? rule.getRuleName() : "Unnamed Rule");
                        prevLogicalToActualId.put(logicalId, rule.getId());
                    }
                    
                    Set<Long> prevLogicalIds = prevRulesByLogicalId.keySet();
                    
                    // Find added rules (logical ID in current but not in previous)
                    for (Long logicalId : currentLogicalIds) {
                        if (!prevLogicalIds.contains(logicalId)) {
                            Map<String, Object> ruleInfo = new HashMap<>();
                            ruleInfo.put("id", currentLogicalToActualId.get(logicalId));
                            ruleInfo.put("name", currentRuleNames.get(logicalId));
                            added.add(ruleInfo);
                        }
                    }
                    
                    // Find removed rules (logical ID in previous but not in current)
                    for (Long logicalId : prevLogicalIds) {
                        if (!currentLogicalIds.contains(logicalId)) {
                            Map<String, Object> ruleInfo = new HashMap<>();
                            ruleInfo.put("id", prevLogicalToActualId.get(logicalId));
                            ruleInfo.put("name", prevRuleNames.getOrDefault(logicalId, "Unknown Rule"));
                            removed.add(ruleInfo);
                        }
                    }
                    
                    // Find updated rules (logical ID in both, but content/priority/active changed)
                    for (Long logicalId : currentLogicalIds) {
                        if (prevLogicalIds.contains(logicalId)) {
                            DecisionRule currentRule = currentRulesByLogicalId.get(logicalId);
                            DecisionRule prevRule = prevRulesByLogicalId.get(logicalId);
                            
                            if (currentRule != null && prevRule != null) {
                                // Check if rule content, priority, or active status changed
                                boolean contentChanged = !Objects.equals(currentRule.getRuleContent(), prevRule.getRuleContent());
                                boolean priorityChanged = !Objects.equals(currentRule.getPriority(), prevRule.getPriority());
                                boolean activeChanged = !Objects.equals(currentRule.getActive(), prevRule.getActive());
                                
                                if (contentChanged || priorityChanged || activeChanged) {
                                    Map<String, Object> ruleInfo = new HashMap<>();
                                    ruleInfo.put("id", currentLogicalToActualId.get(logicalId));
                                    ruleInfo.put("name", currentRuleNames.get(logicalId));
                                    updated.add(ruleInfo);
                                }
                            }
                        }
                    }
                } else {
                    // Previous version had no rules, all current rules are added
                    for (Long logicalId : currentLogicalIds) {
                        Map<String, Object> ruleInfo = new HashMap<>();
                        ruleInfo.put("id", currentLogicalToActualId.get(logicalId));
                        ruleInfo.put("name", currentRuleNames.get(logicalId));
                        added.add(ruleInfo);
                    }
                }
            } else {
                // First version, all rules are added
                for (Long logicalId : currentLogicalIds) {
                    Map<String, Object> ruleInfo = new HashMap<>();
                    ruleInfo.put("id", currentLogicalToActualId.get(logicalId));
                    ruleInfo.put("name", currentRuleNames.get(logicalId));
                    added.add(ruleInfo);
                }
            }
            
            changes.put("added", added);
            changes.put("removed", removed);
            changes.put("updated", updated);
            
            ObjectMapper mapper = new ObjectMapper();
            return mapper.writeValueAsString(changes);
        } catch (Exception e) {
            // Fallback: return empty changes
            return "{\"added\":[],\"removed\":[],\"updated\":[]}";
        }
    }
    
    /**
     * Get current KieContainer version for a specific fact type
     * @param factType Fact type (e.g., "Declaration", "Order")
     * @return Current container version, or 0 if not found
     */
    public long getContainerVersion(String factType) {
        lock.readLock().lock();
        try {
            ContainerInfo info = containers.get(factType);
            return info != null ? info.version : 0;
        } finally {
            lock.readLock().unlock();
        }
    }
    
    /**
     * Get current KieContainer version (defaults to FactType.DECLARATION for backward compatibility)
     * Prefer using the overload with FactType to avoid string literals.
     * @return Current container version
     */
    @Deprecated
    public long getContainerVersion() {
        return getContainerVersion(rule.engine.org.app.domain.entity.ui.FactType.DECLARATION.getValue());
    }
    
    /**
     * Get current KieContainer release ID for a specific fact type
     * @param factType Fact type (e.g., "Declaration", "Order")
     * @return ReleaseId string, or null if container not built yet
     */
    public String getContainerReleaseId(String factType) {
        lock.readLock().lock();
        try {
            ContainerInfo info = containers.get(factType);
            if (info == null || info.kieModule == null) {
                return null;
            }
            return info.kieModule.getReleaseId().toString();
        } finally {
            lock.readLock().unlock();
        }
    }
    
    /**
     * Get current KieContainer release ID (defaults to FactType.DECLARATION for backward compatibility)
     * Prefer using the overload with FactType to avoid string literals.
     * @return ReleaseId string, or null if container not built yet
     */
    @Deprecated
    public String getContainerReleaseId() {
        return getContainerReleaseId(rule.engine.org.app.domain.entity.ui.FactType.DECLARATION.getValue());
    }
    
    /**
     * Get all fact types that have containers
     */
    public Set<String> getFactTypes() {
        lock.readLock().lock();
        try {
            return new HashSet<>(containers.keySet());
        } finally {
            lock.readLock().unlock();
        }
    }
    
    /**
     * Type-safe overloads using FactType enum
     */
    public long getContainerVersion(rule.engine.org.app.domain.entity.ui.FactType factType) {
        return getContainerVersion(factType.getValue());
    }
    
    public String getContainerReleaseId(rule.engine.org.app.domain.entity.ui.FactType factType) {
        return getContainerReleaseId(factType.getValue());
    }
    
    /**
     * Get container status for a specific fact type
     * @param factType Fact type (e.g., "Declaration", "Order")
     * @return Map containing container status information
     */
    public Map<String, Object> getContainerStatus(String factType) {
        lock.readLock().lock();
        try {
            Map<String, Object> status = new HashMap<>();
            ContainerInfo info = containers.get(factType);
            
            if (info == null) {
                status.put("exists", false);
                status.put("valid", false);
                status.put("message", "Container not found for fact type: " + factType);
                return status;
            }
            
            status.put("exists", true);
            status.put("version", info.version);
            status.put("releaseId", info.kieModule != null ? info.kieModule.getReleaseId().toString() : null);
            status.put("rulesHash", info.lastRulesHash);
            
            // Verify container can create session
            boolean valid = false;
            String errorMessage = null;
            try {
                if (info.container != null) {
                    StatelessKieSession testSession = info.container.newStatelessKieSession();
                    if (testSession != null) {
                        valid = true;
                        status.put("message", "Container is valid and can create sessions");
                    } else {
                        errorMessage = "Container exists but cannot create session";
                    }
                } else {
                    errorMessage = "Container is null";
                }
            } catch (Exception e) {
                errorMessage = "Error creating session: " + e.getMessage();
            }
            
            status.put("valid", valid);
            if (errorMessage != null) {
                status.put("error", errorMessage);
            }
            
            return status;
        } finally {
            lock.readLock().unlock();
        }
    }
    
    /**
     * Get status of all containers
     * @return Map of fact type -> container status
     */
    public Map<String, Map<String, Object>> getAllContainersStatus() {
        lock.readLock().lock();
        try {
            Map<String, Map<String, Object>> allStatus = new HashMap<>();
            for (String factType : containers.keySet()) {
                allStatus.put(factType, getContainerStatus(factType));
            }
            return allStatus;
        } finally {
            lock.readLock().unlock();
        }
    }
    
    /**
     * Verify container can fire rules (test execution)
     * @param factType Fact type (e.g., "Declaration", "Order")
     * @return Map containing verification result
     */
    public Map<String, Object> verifyContainer(String factType) {
        lock.readLock().lock();
        try {
            Map<String, Object> result = new HashMap<>();
            ContainerInfo info = containers.get(factType);
            
            if (info == null || info.container == null) {
                result.put("success", false);
                result.put("message", "Container not found for fact type: " + factType);
                return result;
            }
            
            try {
                // Try to create a session
                StatelessKieSession session = info.container.newStatelessKieSession();
                if (session == null) {
                    result.put("success", false);
                    result.put("message", "Cannot create session from container");
                    return result;
                }
                
                // Try to get KieBase info
                org.kie.api.KieBase kieBase = info.container.getKieBase();
                if (kieBase == null) {
                    result.put("success", false);
                    result.put("message", "KieBase is null");
                    return result;
                }
                
                // Get number of rules in KieBase
                int ruleCount = kieBase.getKiePackages().stream()
                    .mapToInt(pkg -> pkg.getRules().size())
                    .sum();
                
                result.put("success", true);
                result.put("message", "Container is valid and ready to use");
                result.put("ruleCount", ruleCount);
                result.put("version", info.version);
                result.put("releaseId", info.kieModule != null ? info.kieModule.getReleaseId().toString() : null);
                
            } catch (Exception e) {
                result.put("success", false);
                result.put("message", "Error verifying container: " + e.getMessage());
                result.put("error", e.getClass().getName());
            }
            
            return result;
        } finally {
            lock.readLock().unlock();
        }
    }
    
    /**
     * Result of building KieContainer
     */
    private static class KieContainerBuildResult {
        final KieContainer container;
        final KieModule kieModule;
        
        KieContainerBuildResult(KieContainer container, KieModule kieModule) {
            this.container = container;
            this.kieModule = kieModule;
        }
    }
    
    /**
     * Fire rules for a specific fact type
     * @param factType Fact type (e.g., "Declaration", "Order")
     * @param fact Fact object to evaluate (must match the fact type)
     * @return TotalRuleResults
     */
    public TotalRuleResults fireRules(String factType, Object fact) {
        lock.readLock().lock();
        try {
            ContainerInfo info = containers.get(factType);
            if (info == null || info.container == null) {
                TotalRuleResults empty = new TotalRuleResults();
                empty.setRunAt(LocalDateTime.now());
                empty.setTotalScore(BigDecimal.ZERO);
                return empty;
            }
            
            // Create result container
            TotalRuleResults results = new TotalRuleResults();
            results.setRunAt(LocalDateTime.now());
            
            StatelessKieSession session = info.container.newStatelessKieSession();
            // Set TotalRuleResults as global so rules can add outputs
            session.setGlobal("totalResults", results);
            session.execute(fact);
            
            // Aggregate results after execution
            aggregateResults(results);
            
            return results;
        } finally {
            lock.readLock().unlock();
        }
    }
    
    /**
     * Fire rules for Declaration (backward compatibility)
     */
    public TotalRuleResults fireRules(Declaration declaration) {
        return fireRules("Declaration", declaration);
    }
    
    /**
     * Fire rules with a specific version (for testing historical versions)
     * This creates a temporary KieContainer from rules in the specified version
     * 
     * @param factType Fact type (e.g., "Declaration")
     * @param fact Fact object to evaluate
     * @param version Version number to test with (e.g., 1, 2, 3)
     * @return TotalRuleResults
     */
    public TotalRuleResults fireRulesWithVersion(String factType, Object fact, long version) {
        try {
            // Get the version from database
            FactType factTypeEnum = FactType.fromValue(factType);
            Optional<KieContainerVersion> versionOpt = containerVersionRepository
                .findByFactTypeAndVersion(factTypeEnum, version);
            
            if (versionOpt.isEmpty()) {
                throw new IllegalArgumentException("Version " + version + " not found for fact type " + factType);
            }
            
            KieContainerVersion containerVersion = versionOpt.get();
            String ruleIds = containerVersion.getRuleIds();
            
            if (ruleIds == null || ruleIds.isEmpty()) {
                throw new IllegalArgumentException("No rules found in version " + version + " for fact type " + factType);
            }
            
            // Parse rule IDs and load rules
            List<Long> ruleIdList = Arrays.stream(ruleIds.split(","))
                .filter(s -> !s.isEmpty())
                .map(Long::parseLong)
                .collect(Collectors.toList());
            
            List<DecisionRule> rules = decisionRuleRepository.findAllById(ruleIdList);
            
            if (rules.isEmpty()) {
                throw new IllegalArgumentException("Rules not found for version " + version + " of fact type " + factType);
            }
            
            // Build temporary KieContainer with these rules
            KieContainerBuildResult buildResult = buildKieContainer(rules, factType, version);
            
            try {
                // Create result container
                TotalRuleResults results = new TotalRuleResults();
                results.setRunAt(LocalDateTime.now());
                
                StatelessKieSession session = buildResult.container.newStatelessKieSession();
                // Set TotalRuleResults as global so rules can add outputs
                session.setGlobal("totalResults", results);
                session.execute(fact);
                
                // Aggregate results after execution
                aggregateResults(results);
                
                return results;
            } finally {
                // Cleanup temporary container
                if (buildResult.container != null) {
                    buildResult.container.dispose();
                }
            }
        } catch (Exception e) {
            System.err.println("[RULE ENGINE] Error executing rules with version " + version + " for fact type " + factType + ": " + e.getMessage());
            throw new RuntimeException("Failed to execute rules with version " + version + " for fact type " + factType, e);
        }
    }
    
    private void aggregateResults(TotalRuleResults results) {
        if (results.getHits().isEmpty()) {
            results.setTotalScore(BigDecimal.ZERO);
            results.setFinalAction("APPROVE"); // Default if no hits
            return;
        }
        
        // Calculate total score (sum of all hit scores)
        BigDecimal total = results.getHits().stream()
            .map(hit -> hit.getScore() != null ? hit.getScore() : BigDecimal.ZERO)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        results.setTotalScore(total);
        
        // Determine final action (highest priority: REJECT > REVIEW > FLAG > HOLD > APPROVE)
        String finalAction = results.getHits().stream()
            .map(RuleOutputHit::getAction)
            .filter(action -> action != null && !action.isEmpty())
            .max(Comparator.comparingInt(action -> {
                switch (action.toUpperCase()) {
                    case "REJECT": return 5;
                    case "REVIEW": return 4;
                    case "FLAG": return 3;
                    case "HOLD": return 2;
                    case "APPROVE": return 1;
                    default: return 0;
                }
            }))
            .orElse("APPROVE");
        results.setFinalAction(finalAction);
        
        // Determine final flag (use first non-null flag, or highest score flag)
        String finalFlag = results.getHits().stream()
            .filter(hit -> hit.getFlag() != null && !hit.getFlag().isEmpty())
            .max(Comparator.comparing(hit -> hit.getScore() != null ? hit.getScore() : BigDecimal.ZERO))
            .map(RuleOutputHit::getFlag)
            .orElse(null);
        results.setFinalFlag(finalFlag);
    }
    
    private KieContainerBuildResult buildKieContainer(List<DecisionRule> rules, String factType, long versionNumber) {
        KieServices kieServices = KieServices.Factory.get();
        KieFileSystem kfs = kieServices.newKieFileSystem();
        
        // Set ReleaseId with format: org.rule.{factType}:{version}
        // groupId: "org.rule"
        // artifactId: factType in lowercase (e.g., "declaration", "cargoreport") - Maven convention
        // version: use actual version number (e.g., "1.0.0", "2.0.0", "3.0.0")
        String groupId = "org.rule";
        String artifactId = factType.toLowerCase();
        String version = versionNumber + ".0.0";
        org.kie.api.builder.ReleaseId releaseId = kieServices.newReleaseId(groupId, artifactId, version);
        kfs.generateAndWritePomXML(releaseId);
        
        StringBuilder drl = new StringBuilder();
        
        // DRL header (package, imports, globals)
        drl.append(DrlConstants.buildDrlHeader());
        
        for (DecisionRule rule : rules) {
            // Use ruleContent directly (complete DRL)
            String ruleContent = rule.getRuleContent();
            if (ruleContent == null || ruleContent.isBlank()) {
                // Fallback: build minimal DRL if ruleContent is missing
                String droolsRuleName = rule.getRuleName() + "_" + rule.getId();
                drl.append("rule \"").append(droolsRuleName).append("\"\n");
                drl.append("salience ").append(rule.getPriority()).append("\n");
                drl.append("when\n");
                drl.append("    $d : ").append(factType).append("()\n");
                drl.append("then\n");
                drl.append("    System.out.println(\"[DROOLS] Rule '").append(rule.getRuleName())
                   .append("' matched for ").append(factType.toLowerCase()).append(": \" + $d);\n");
                drl.append("end\n\n");
            } else {
                // ruleContent is complete DRL (includes package, imports, globals, and rule)
                // Extract just the rule definition part (skip package/imports/global if present)
                String ruleDefinition = extractRuleDefinition(ruleContent);
                if (ruleDefinition != null && !ruleDefinition.isBlank()) {
                    drl.append(ruleDefinition);
                    if (!ruleDefinition.endsWith("\n")) {
                        drl.append("\n");
                    }
                    drl.append("\n"); // Add blank line between rules
                }
            }
        }
        
        kfs.write("src/main/resources/rules/" + factType.toLowerCase() + "_rules.drl", drl.toString());
        
        KieBuilder kieBuilder = kieServices.newKieBuilder(kfs).buildAll();
        
        // Check for build errors
        if (kieBuilder.getResults().hasMessages(org.kie.api.builder.Message.Level.ERROR)) {
            throw new RuntimeException("Error building KieModule for fact type " + factType + ": " + kieBuilder.getResults().getMessages());
        }
        
        KieModule kieModule = kieBuilder.getKieModule();
        
        // Register KieModule in KieRepository before creating container
        // This ensures the KieModule can be found when creating container from ReleaseId
        kieServices.getRepository().addKieModule(kieModule);
        
        // Create container from the built KieModule's ReleaseId
        KieContainer container = kieServices.newKieContainer(kieModule.getReleaseId());
        
        return new KieContainerBuildResult(container, kieModule);
    }
    
    /**
     * Extract rule definition from complete DRL content
     * Removes package, imports, and globals, keeping only the rule definition
     */
    private String extractRuleDefinition(String completeDrl) {
        if (completeDrl == null || completeDrl.isBlank()) {
            return null;
        }
        
        // Find the start of rule definition (look for "rule \"")
        int ruleStart = completeDrl.indexOf("rule \"");
        if (ruleStart == -1) {
            // If no "rule \"" found, try to find just "rule "
            ruleStart = completeDrl.indexOf("rule ");
            if (ruleStart == -1) {
                return null;
            }
        }
        
        // Extract from "rule" to end of file
        String rulePart = completeDrl.substring(ruleStart);
        
        // Trim any leading/trailing whitespace
        rulePart = rulePart.trim();
        
        // Ensure it ends with newline
        if (!rulePart.endsWith("\n")) {
            rulePart = rulePart + "\n";
        }
        
        return rulePart;
    }
    
    /**
     * Dispose all containers (cleanup on shutdown)
     */
    @jakarta.annotation.PreDestroy
    public void disposeAll() {
        lock.writeLock().lock();
        try {
            for (ContainerInfo info : containers.values()) {
                if (info.container != null) {
                    info.container.dispose();
                }
            }
            containers.clear();
        } finally {
            lock.writeLock().unlock();
        }
    }
}
