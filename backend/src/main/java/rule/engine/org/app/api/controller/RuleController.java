package rule.engine.org.app.api.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import rule.engine.org.app.api.request.RuleOutputRequest;
import rule.engine.org.app.api.request.CreateRuleRequest;
import rule.engine.org.app.api.request.UpdateRuleRequest;
import rule.engine.org.app.api.request.RestoreVersionRequest;
import rule.engine.org.app.api.request.ActivateVersionRequest;
import rule.engine.org.app.api.response.ConditionResponse;
import rule.engine.org.app.api.response.RuleExecutionResponse;
import rule.engine.org.app.api.response.RuleExecuteResponse;
import rule.engine.org.app.api.response.ErrorResponse;
import rule.engine.org.app.api.response.RuleResponse;
import rule.engine.org.app.api.response.DeployResponse;
import rule.engine.org.app.api.response.PackageInfoResponse;
import rule.engine.org.app.api.response.ContainerStatusResponse;
import rule.engine.org.app.api.response.RuleFieldMetadata;
import rule.engine.org.app.api.response.RuleFieldMetadata.FieldDefinition;
import rule.engine.org.app.domain.entity.ui.DecisionRule;
import rule.engine.org.app.domain.entity.ui.FactType;
import rule.engine.org.app.domain.entity.ui.RuleStatus;
import rule.engine.org.app.domain.entity.ui.RuleExecutionResult;
import rule.engine.org.app.domain.entity.ui.RuleConditionGroup;
import rule.engine.org.app.domain.entity.ui.RuleCondition;
import rule.engine.org.app.domain.entity.ui.RuleOutput;
import rule.engine.org.app.domain.entity.ui.RuleOutputGroup;
import rule.engine.org.app.domain.entity.ui.RuleGroupType;
import rule.engine.org.app.domain.entity.ui.RuleOperatorType;
import rule.engine.org.app.domain.entity.ui.RuleValueType;
import rule.engine.org.app.domain.repository.DecisionRuleRepository;
import rule.engine.org.app.domain.repository.RuleExecutionResultRepository;
import rule.engine.org.app.domain.repository.RuleConditionGroupRepository;
import rule.engine.org.app.domain.repository.RuleConditionRepository;
import rule.engine.org.app.domain.repository.RuleOutputRepository;
import rule.engine.org.app.domain.repository.RuleOutputGroupRepository;
import rule.engine.org.app.domain.repository.KieContainerVersionRepository;
import rule.engine.org.app.domain.service.RuleEngineManager;
import rule.engine.org.app.domain.service.RuleVersionService;
import rule.engine.org.app.domain.service.AIRuleGeneratorService;
import rule.engine.org.app.domain.entity.ui.KieContainerVersion;
import rule.engine.org.app.api.request.AIGenerateRuleRequest;
import rule.engine.org.app.api.response.AIGenerateRuleResponse;
import rule.engine.org.app.security.UserPrincipal;
import rule.engine.org.app.util.RuleFieldExtractor;
import rule.engine.org.app.util.DrlConstants;
import rule.engine.org.app.util.EntityScannerService;

import java.lang.reflect.Field;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/rules")
public class RuleController {

    private static final Logger log = LoggerFactory.getLogger(RuleController.class);

    private final DecisionRuleRepository decisionRuleRepository;
    private final RuleExecutionResultRepository executionResultRepository;
    private final RuleEngineManager ruleEngineManager;
    private final RuleVersionService ruleVersionService;
    private final RuleConditionGroupRepository conditionGroupRepository;
    private final RuleConditionRepository conditionRepository;
    private final RuleOutputRepository outputRepository;
    private final RuleOutputGroupRepository outputGroupRepository;
    private final KieContainerVersionRepository containerVersionRepository;
    private final AIRuleGeneratorService aiRuleGeneratorService;
    private final EntityScannerService entityScannerService;

    public RuleController(DecisionRuleRepository decisionRuleRepository,
                        RuleExecutionResultRepository executionResultRepository,
                        RuleEngineManager ruleEngineManager,
                        RuleVersionService ruleVersionService,
                        RuleConditionGroupRepository conditionGroupRepository,
                        RuleConditionRepository conditionRepository,
                        RuleOutputRepository outputRepository,
                        RuleOutputGroupRepository outputGroupRepository,
                        KieContainerVersionRepository containerVersionRepository,
                        AIRuleGeneratorService aiRuleGeneratorService,
                        EntityScannerService entityScannerService) {
        this.decisionRuleRepository = decisionRuleRepository;
        this.executionResultRepository = executionResultRepository;
        this.ruleEngineManager = ruleEngineManager;
        this.ruleVersionService = ruleVersionService;
        this.conditionGroupRepository = conditionGroupRepository;
        this.conditionRepository = conditionRepository;
        this.outputRepository = outputRepository;
        this.outputGroupRepository = outputGroupRepository;
        this.containerVersionRepository = containerVersionRepository;
        this.aiRuleGeneratorService = aiRuleGeneratorService;
        this.entityScannerService = entityScannerService;
    }

    @GetMapping
    public List<DecisionRule> getAllRules(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam(required = false, defaultValue = "true") Boolean latestOnly) {
        String userId = requireUserId(currentUser);
        if (latestOnly) {
            return ruleVersionService.getAllLatestRulesForUser(userId);
        }
        return decisionRuleRepository.findByCreatedByOrderByCreatedAtDesc(userId);
    }

    /**
     * Execute rules with Declaration data
     * This endpoint accepts Declaration data and fires all matching rules
     * Supports testing with a specific version by passing "version" parameter
     * IMPORTANT: This endpoint must be placed BEFORE endpoints with path variables like /{id} or /{ruleId}/executions
     * to avoid path matching conflicts (Spring may match /execute with /{ruleId}/executions)
     */
    @PostMapping(value = "/execute", consumes = org.springframework.http.MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> executeRules(
            @RequestBody Map<String, Object> declarationData,
            @RequestParam(required = false) Long version) {
        try {
            // Convert map to Declaration entity
            rule.engine.org.app.domain.entity.execution.declaration.Declaration declaration = 
                buildDeclarationFromMap(declarationData);
            
            // Get fact type from declaration data or default to "Declaration"
            String factTypeStr = (String) declarationData.getOrDefault("factType", "Declaration");
            FactType factType = FactType.fromValue(factTypeStr);
            
            // Fire rules using RuleEngineManager
            rule.engine.org.app.domain.entity.execution.TotalRuleResults results;
            
            if (version != null && version > 0) {
                // Execute with specific version
                results = ruleEngineManager.fireRulesWithVersion(factType.getValue(), declaration, version);
            } else {
                // Execute with current version
                results = ruleEngineManager.fireRules(factType.getValue(), declaration);
            }
            
            // Build response using DTO factory method
            RuleExecuteResponse response = RuleExecuteResponse.from(results, declaration.getDeclarationId());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error(e.getMessage())
                .errorType(e.getClass().getName())
                .build();
            log.error("Error executing rules", e);
            return ResponseEntity.status(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR)
                .body(errorResponse);
        }
    }

    /**
     * AI-powered rule generation endpoint.
     * Accepts natural language input and generates a structured rule using OpenAI GPT.
     * Returns the generated rule for preview or saves it directly based on previewOnly flag.
     * IMPORTANT: This endpoint must be placed BEFORE endpoints with path variables like /{id}
     */
    @PostMapping(value = "/ai-generate", consumes = org.springframework.http.MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AIGenerateRuleResponse> generateRuleFromNaturalLanguage(
            @jakarta.validation.Valid @RequestBody AIGenerateRuleRequest request) {
        try {
            log.info("Received AI rule generation request: {}", request.getNaturalLanguageInput());
            
            // Generate rule using AI service
            AIGenerateRuleResponse response = aiRuleGeneratorService.generateRule(request);
            
            // If not preview-only and generation was successful, save the rule
            Boolean previewOnly = request.getPreviewOnly() != null ? request.getPreviewOnly() : true;
            if (!previewOnly && response.getSuccess() && response.getValidation().getValid()) {
                try {
                    CreateRuleRequest ruleToSave = response.getGeneratedRule();
                    
                    // Check for duplicate rule name
                    if (ruleToSave.getRuleName() != null) {
                        Optional<DecisionRule> existingRule = 
                            decisionRuleRepository.findByRuleNameAndIsLatestTrue(ruleToSave.getRuleName());
                        if (existingRule.isPresent()) {
                            response.setSuccess(false);
                            response.setErrorMessage("Rule name already exists: " + ruleToSave.getRuleName());
                            return ResponseEntity.badRequest().body(response);
                        }
                    }
                    
                    // Build and save rule
                    DecisionRule rule = buildRuleFromRequest(ruleToSave);
                    // Mark as AI-generated since it comes from AI generation endpoint
                    rule.setGeneratedByAi(true);
                    String ruleContent = buildCompleteDrlFromRequest(ruleToSave, rule);
                    
                    if (ruleContent == null || ruleContent.isBlank()) {
                        response.setSuccess(false);
                        response.setErrorMessage("Failed to generate rule content");
                        return ResponseEntity.badRequest().body(response);
                    }
                    
                    rule.setRuleContent(ruleContent);
                    DecisionRule saved = decisionRuleRepository.save(rule);
                    
                    // Update rule content with actual ID
                    if (saved.getId() != null && saved.getId() != 0L) {
                        String updatedRuleContent = buildCompleteDrlFromRequest(ruleToSave, saved);
                        if (updatedRuleContent != null && !updatedRuleContent.isBlank()) {
                            saved.setRuleContent(updatedRuleContent);
                            saved = decisionRuleRepository.save(saved);
                        }
                    }
                    
                    // Save conditions and outputs
                    if (ruleToSave.getConditions() != null && !ruleToSave.getConditions().isEmpty()) {
                        saveRuleConditions(saved, ruleToSave.getConditions());
                    }
                    
                    if (ruleToSave.getOutput() != null) {
                        saveRuleOutputs(saved, ruleToSave.getOutput());
                    }
                    
                    // Set saved rule ID in response
                    response.setSavedRuleId(saved.getId());
                    
                    log.info("AI-generated rule saved as DRAFT with ID: {} (no rebuild needed until activation)", saved.getId());
                    
                } catch (Exception e) {
                    log.error("Error saving AI-generated rule", e);
                    response.setSuccess(false);
                    response.setErrorMessage("Generated rule is valid but failed to save: " + e.getMessage());
                    return ResponseEntity.status(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR).body(response);
                }
            }
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            log.error("Error in AI rule generation endpoint", e);
            AIGenerateRuleResponse errorResponse = AIGenerateRuleResponse.builder()
                .success(false)
                .errorMessage("Failed to generate rule: " + e.getMessage())
                .suggestions(List.of(
                    "Please try rephrasing your request",
                    "Ensure OpenAI API is properly configured",
                    "Check system logs for detailed error information"
                ))
                .build();
            return ResponseEntity.status(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR)
                .body(errorResponse);
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<RuleResponse> getRule(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        String userId = requireUserId(currentUser);
        Optional<DecisionRule> ruleOpt = decisionRuleRepository.findByIdAndCreatedBy(id, userId);
        
        if (ruleOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        DecisionRule rule = ruleOpt.get();
        
        // Refresh rule from database to ensure all associations are loaded
        decisionRuleRepository.flush();
        rule = decisionRuleRepository.findById(id).orElse(rule);
        
        // Build response using DTO (no request)
        RuleResponse response = buildRuleResponseInternal(rule, null);
        return ResponseEntity.ok(response);
    }

    @PostMapping
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<?> createRule(@RequestBody CreateRuleRequest request) {
        // Build DecisionRule from request DTO
        DecisionRule rule = buildRuleFromRequest(request);
        
        // Check for duplicate rule name (only check latest versions)
        if (rule.getRuleName() != null) {
            Optional<DecisionRule> existingRule = decisionRuleRepository.findByRuleNameAndIsLatestTrue(rule.getRuleName());
            if (existingRule.isPresent()) {
                ErrorResponse errorResponse = ErrorResponse.builder()
                    .success(false)
                    .error("Rule name already exists")
                    .errorType("ValidationException")
                    .build();
                return ResponseEntity.badRequest().body(errorResponse);
            }
        }
        
        // Generate ruleContent before saving (uses placeholder ID 0 if rule not yet saved)
        String ruleContent = buildCompleteDrlFromRequest(request, rule);
        if (ruleContent == null || ruleContent.isBlank()) {
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error("Failed to generate rule content: conditions or output are required")
                .errorType("ValidationException")
                .build();
            return ResponseEntity.badRequest().body(errorResponse);
        }
        rule.setRuleContent(ruleContent);
        
        // Save DecisionRule (now with ruleContent)
        DecisionRule saved = decisionRuleRepository.save(rule);
        
        // Rebuild ruleContent with correct rule ID (if ID was used as placeholder)
        if (saved.getId() != null && saved.getId() != 0L) {
            String updatedRuleContent = buildCompleteDrlFromRequest(request, saved);
            if (updatedRuleContent != null && !updatedRuleContent.isBlank()) {
                saved.setRuleContent(updatedRuleContent);
                saved = decisionRuleRepository.save(saved);
            }
        }
        
        // Parse and save conditions if provided
        if (request.getConditions() != null && !request.getConditions().isEmpty()) {
            try {
                saveRuleConditions(saved, request.getConditions());
                conditionGroupRepository.flush(); // Ensure conditions are persisted
                conditionRepository.flush(); // Ensure conditions are persisted
                log.info("Successfully saved {} conditions for rule {}", 
                    request.getConditions().size(), saved.getId());
            } catch (Exception ex) {
                log.error("Failed to persist structured conditions for rule {}: {}", saved.getRuleName(), ex.getMessage(), ex);
                throw ex; // Re-throw to fail the request
            }
        }
        
        // Parse and save outputs if provided
        if (request.getOutput() != null) {
            try {
                saveRuleOutputs(saved, request.getOutput());
                outputRepository.flush(); // Ensure outputs are persisted
            } catch (Exception ex) {
                log.warn("Failed to persist rule outputs for rule {}: {}", saved.getRuleName(), ex.getMessage());
            }
        }
        
        // Flush all changes before reloading
        decisionRuleRepository.flush();
        
        // Rebuild rules for this fact type
        FactType factType = saved.getFactType() != null ? saved.getFactType() : FactType.DECLARATION;
        ruleEngineManager.rebuildRules(factType.getValue());
        
        // Reload rule from database to ensure all associations are loaded
        saved = decisionRuleRepository.findById(saved.getId()).orElse(saved);
        
        // Build response using DTO
        RuleResponse response = buildRuleResponse(saved, request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{id}")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<?> updateRule(
            @PathVariable Long id, 
            @RequestBody UpdateRuleRequest request) {
        if (!decisionRuleRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        
        // Extract createNewVersion flag (default: true for versioning)
        Boolean createNewVersion = request.getCreateNewVersion() != null ? request.getCreateNewVersion() : true;
        String versionNotes = request.getVersionNotes();
        
        // Build DecisionRule from request DTO
        DecisionRule rule = buildRuleFromRequest(request);
        
        // Check for duplicate rule name (only check latest versions, exclude current rule and its versions)
        if (rule.getRuleName() != null) {
            Optional<DecisionRule> existingRule = decisionRuleRepository.findByRuleNameAndIsLatestTrue(rule.getRuleName());
            if (existingRule.isPresent()) {
                DecisionRule existing = existingRule.get();
                DecisionRule currentRule = decisionRuleRepository.findById(id).orElse(null);
                
                // If creating new version, exclude parent rule and its versions
                // If updating directly, exclude only the current rule
                if (createNewVersion && currentRule != null) {
                    // Get parent rule ID of current rule (if current rule is a version, use its parent; otherwise use current rule ID)
                    Long currentParentId = currentRule.getParentRuleId() != null ? currentRule.getParentRuleId() : currentRule.getId();
                    Long existingParentId = existing.getParentRuleId() != null ? existing.getParentRuleId() : existing.getId();
                    
                    // Only error if existing rule is NOT a version of the current rule
                    if (!currentParentId.equals(existingParentId)) {
                        ErrorResponse errorResponse = ErrorResponse.builder()
                            .success(false)
                            .error("Rule name already exists")
                            .errorType("ValidationException")
                            .build();
                        return ResponseEntity.badRequest().body(errorResponse);
                    }
                } else {
                    // Exclude only if it's a different rule
                    if (!existing.getId().equals(id)) {
                        ErrorResponse errorResponse = ErrorResponse.builder()
                            .success(false)
                            .error("Rule name already exists")
                            .errorType("ValidationException")
                            .build();
                        return ResponseEntity.badRequest().body(errorResponse);
                    }
                }
            }
        }
        
        // Generate ruleContent before saving
        rule.setId(id); // Set ID for ruleContent generation (needed for both createNewVersion and direct update)
        String ruleContent = buildCompleteDrlFromRequest(request, rule);
        if (ruleContent == null || ruleContent.isBlank()) {
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error("Failed to generate rule content: conditions or output are required")
                .errorType("ValidationException")
                .build();
            return ResponseEntity.badRequest().body(errorResponse);
        }
        rule.setRuleContent(ruleContent);
        
        DecisionRule saved;
        if (createNewVersion) {
            // Create new version instead of updating existing rule
            saved = ruleVersionService.createNewVersion(id, rule, versionNotes);
            // Rebuild ruleContent with correct rule ID (new version will have new ID)
            if (saved.getId() != null && !saved.getId().equals(id)) {
                String updatedRuleContent = buildCompleteDrlFromRequest(request, saved);
                if (updatedRuleContent != null && !updatedRuleContent.isBlank()) {
                    saved.setRuleContent(updatedRuleContent);
                    saved = decisionRuleRepository.save(saved);
                }
            }
        } else {
            // Direct update (no versioning)
            saved = decisionRuleRepository.save(rule);
        }
        
        // Parse and save conditions if provided
        if (request.getConditions() != null && !request.getConditions().isEmpty()) {
            try {
                saveRuleConditions(saved, request.getConditions());
                conditionGroupRepository.flush(); // Ensure conditions are persisted
                conditionRepository.flush(); // Ensure conditions are persisted
                log.info("Successfully saved {} conditions for rule {}", 
                    request.getConditions().size(), saved.getId());
            } catch (Exception ex) {
                log.error("Failed to persist structured conditions for rule {}: {}", saved.getRuleName(), ex.getMessage(), ex);
                throw ex; // Re-throw to fail the request
            }
        }
        
        // Parse and save outputs if provided
        if (request.getOutput() != null) {
            try {
                saveRuleOutputs(saved, request.getOutput());
                outputRepository.flush(); // Ensure outputs are persisted
            } catch (Exception ex) {
                log.warn("Failed to persist rule outputs for rule {}: {}", saved.getRuleName(), ex.getMessage());
            }
        }
        
        // Flush all changes before reloading
        decisionRuleRepository.flush();
        
        // Rebuild rules for this fact type
        FactType factType = saved.getFactType() != null ? saved.getFactType() : FactType.DECLARATION;
        ruleEngineManager.rebuildRules(factType.getValue());
        
        // Reload rule from database to ensure all associations are loaded
        saved = decisionRuleRepository.findById(saved.getId()).orElse(saved);
        
        // Build response using DTO
        RuleResponse response = buildRuleResponse(saved, request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteRule(@PathVariable Long id) {
        if (!decisionRuleRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        // Get fact type before deleting
        DecisionRule rule = decisionRuleRepository.findById(id).orElse(null);
        FactType factType = rule != null && rule.getFactType() != null ? rule.getFactType() : FactType.DECLARATION;
        decisionRuleRepository.deleteById(id);
        ruleEngineManager.rebuildRules(factType.getValue()); // Rebuild rules for this fact type
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/refresh")
    public ResponseEntity<Map<String, String>> refreshRules(
            @RequestParam(required = false) String factType) {
        if (factType != null && !factType.isEmpty()) {
            ruleEngineManager.rebuildRules(factType);
        } else {
            ruleEngineManager.rebuildRules(); // Rebuild all fact types
        }
        return ResponseEntity.ok(Map.of(
            "success", "true",
            "message", "Rules refreshed successfully",
            "factType", factType != null ? factType : "All"
        ));
    }

    @PostMapping("/deploy")
    public ResponseEntity<DeployResponse> deployRules(
            @RequestParam(required = false) String factType) {
        if (factType != null && !factType.isEmpty()) {
            ruleEngineManager.deployRules(factType);
        } else {
            ruleEngineManager.deployRules(); // Deploy all fact types
        }
        
        // Get updated package info after deploy
        FactType targetFactType = factType != null && !factType.isEmpty() 
            ? FactType.fromValue(factType) : FactType.DECLARATION;
        long currentVersion = ruleEngineManager.getContainerVersion(targetFactType.getValue());
        String releaseId = ruleEngineManager.getContainerReleaseId(targetFactType.getValue());
        
        // Build response using DTO
        DeployResponse.DeployResponseBuilder responseBuilder = DeployResponse.builder()
            .version(currentVersion)
            .releaseId(releaseId)
            .message("Rules deployed successfully");
        
        // Get latest version from database for this fact type
        Optional<KieContainerVersion> latestVersion = containerVersionRepository.findLatestVersionByFactType(targetFactType.getValue());
        if (latestVersion.isPresent()) {
            KieContainerVersion version = latestVersion.get();
            responseBuilder.rulesCount(version.getRulesCount())
                .changesDescription(version.getChangesDescription())
                .deployedAt(version.getCreatedAt());
        }
        
        return ResponseEntity.ok(responseBuilder.build());
    }

    @GetMapping("/package/info")
    public ResponseEntity<PackageInfoResponse> getPackageInfo(
            @RequestParam(required = false, defaultValue = "Declaration") String factType) {
        // Get current container info from RuleEngineManager
        FactType factTypeEnum = FactType.fromValue(factType);
        long currentVersion = ruleEngineManager.getContainerVersion(factTypeEnum.getValue());
        String releaseId = ruleEngineManager.getContainerReleaseId(factTypeEnum.getValue());
        
        // Extract package name from ReleaseId (format: groupId:artifactId:version)
        String packageName = "rules"; // Default fallback
        if (releaseId != null && releaseId.contains(":")) {
            String[] parts = releaseId.split(":");
            if (parts.length >= 1) {
                packageName = parts[0]; // Use groupId as package name
            }
        }
        
        PackageInfoResponse.PackageInfoResponseBuilder responseBuilder = PackageInfoResponse.builder()
            .version(currentVersion)
            .releaseId(releaseId)
            .packageName(packageName)
            .factType(factTypeEnum.getValue());
        
        // Get latest version from database for this fact type
        Optional<KieContainerVersion> latestVersion = containerVersionRepository.findLatestVersionByFactType(factTypeEnum.getValue());
        if (latestVersion.isPresent()) {
            KieContainerVersion version = latestVersion.get();
            responseBuilder.rulesCount(version.getRulesCount())
                .rulesHash(version.getRulesHash())
                .changesDescription(version.getChangesDescription())
                .ruleIds(version.getRuleIds())
                .deployedAt(version.getCreatedAt())
                .deployedBy(version.getCreatedBy());
            
            // Parse rule changes JSON for current version
            if (version.getRuleChangesJson() != null && !version.getRuleChangesJson().isEmpty()) {
                try {
                    com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                    @SuppressWarnings("unchecked")
                    Map<String, Object> changes = mapper.readValue(version.getRuleChangesJson(), Map.class);
                    responseBuilder.ruleChanges(changes);
                } catch (Exception e) {
                    // Ignore parsing errors
                }
            }
        }
        
        // Get all versions history for this fact type
        List<KieContainerVersion> allVersions = containerVersionRepository.findAllByFactTypeOrderByVersionDesc(factTypeEnum);
        List<PackageInfoResponse.VersionHistoryItem> versionHistory = allVersions.stream()
            .map(v -> {
                PackageInfoResponse.VersionHistoryItem.VersionHistoryItemBuilder itemBuilder = 
                    PackageInfoResponse.VersionHistoryItem.builder()
                        .version(v.getVersion())
                        .rulesCount(v.getRulesCount())
                        .releaseId(v.getReleaseId())
                        .changesDescription(v.getChangesDescription())
                        .ruleIds(v.getRuleIds())
                        .deployedAt(v.getCreatedAt())
                        .deployedBy(v.getCreatedBy());
                
                // Parse rule changes JSON if available
                if (v.getRuleChangesJson() != null && !v.getRuleChangesJson().isEmpty()) {
                    try {
                        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                        @SuppressWarnings("unchecked")
                        Map<String, Object> changes = mapper.readValue(v.getRuleChangesJson(), Map.class);
                        itemBuilder.ruleChanges(changes);
                    } catch (Exception e) {
                        // Ignore parsing errors
                    }
                }
                
                return itemBuilder.build();
            })
            .collect(Collectors.toList());
        responseBuilder.versionHistory(versionHistory);
        
        return ResponseEntity.ok(responseBuilder.build());
    }
    
    /**
     * Get all available fact types
     * Returns fact types from database (all fact types that have rules) merged with default fact types
     * This endpoint is used by UI to populate fact type dropdowns
     */
    @GetMapping("/fact-types")
    public ResponseEntity<List<String>> getFactTypes() {
        // Get fact types from database (all fact types that have rules)
        List<FactType> factTypesFromDb = decisionRuleRepository.findDistinctFactTypes();
        
        // Default fact types that are always available (even if no rules exist yet)
        java.util.Set<FactType> defaultFactTypes = new java.util.HashSet<>(java.util.Arrays.asList(FactType.DECLARATION, FactType.CARGO_REPORT));
        
        // Merge: combine fact types from database with default fact types
        java.util.Set<FactType> allFactTypes = new java.util.HashSet<>(defaultFactTypes);
        if (factTypesFromDb != null && !factTypesFromDb.isEmpty()) {
            allFactTypes.addAll(factTypesFromDb);
        }
        
        // Convert to sorted list of string values for consistent ordering
        List<String> sortedFactTypes = allFactTypes.stream()
            .map(FactType::getValue)
            .sorted()
            .collect(java.util.stream.Collectors.toList());
        
        return ResponseEntity.ok(sortedFactTypes);
    }
    
    /**
     * Get status of all KieContainers
     * Shows which fact types have containers and their status
     */
    @GetMapping("/containers/status")
    public ResponseEntity<ContainerStatusResponse> getAllContainersStatus() {
        Map<String, Map<String, Object>> containersStatus = ruleEngineManager.getAllContainersStatus();
        
        // Get fact types from database (all fact types that have rules)
        List<FactType> factTypesFromDb = decisionRuleRepository.findDistinctFactTypes();
        
        // Default fact types that are always available (even if no rules exist yet)
        java.util.Set<FactType> defaultFactTypes = new java.util.HashSet<>(java.util.Arrays.asList(FactType.DECLARATION, FactType.CARGO_REPORT));
        
        // Merge: combine fact types from database with default fact types
        java.util.Set<FactType> allFactTypes = new java.util.HashSet<>(defaultFactTypes);
        if (factTypesFromDb != null && !factTypesFromDb.isEmpty()) {
            allFactTypes.addAll(factTypesFromDb);
        }
        
        // Convert to sorted list of string values for consistent ordering
        List<String> sortedFactTypes = allFactTypes.stream()
            .map(FactType::getValue)
            .sorted()
            .collect(java.util.stream.Collectors.toList());
        
        List<ContainerStatusResponse.ContainerStatus> containerStatuses = containersStatus.entrySet().stream()
            .sorted(java.util.Map.Entry.comparingByKey())
            .map(entry -> buildContainerStatus(entry.getKey(), entry.getValue()))
            .collect(java.util.stream.Collectors.toList());
        
        ContainerStatusResponse response = ContainerStatusResponse.builder()
            .containers(containerStatuses)
            .totalContainers(containerStatuses.size())
            .factTypes(sortedFactTypes)
            .build();
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * Get status of a specific KieContainer by fact type
     */
    @GetMapping("/containers/status/{factType}")
    public ResponseEntity<Map<String, Object>> getContainerStatus(@PathVariable String factType) {
        Map<String, Object> status = ruleEngineManager.getContainerStatus(factType);
        return ResponseEntity.ok(status);
    }
    
    private ContainerStatusResponse.ContainerStatus buildContainerStatus(
        String factType,
        Map<String, Object> statusMap
    ) {
        if (statusMap == null) {
            return ContainerStatusResponse.ContainerStatus.builder()
                .factType(factType)
                .exists(Boolean.FALSE)
                .valid(Boolean.FALSE)
                .message("Container not found for fact type: " + factType)
                .build();
        }
        
        return ContainerStatusResponse.ContainerStatus.builder()
            .factType(factType)
            .exists(asBoolean(statusMap.get("exists")))
            .valid(asBoolean(statusMap.get("valid")))
            .version(asLong(statusMap.get("version")))
            .releaseId(asString(statusMap.get("releaseId")))
            .rulesHash(asString(statusMap.get("rulesHash")))
            .ruleCount(asInteger(statusMap.get("ruleCount")))
            .message(asString(statusMap.get("message")))
            .error(asString(statusMap.get("error")))
            .build();
    }
    
    private Boolean asBoolean(Object value) {
        if (value instanceof Boolean booleanValue) {
            return booleanValue;
        }
        if (value instanceof String stringValue) {
            return Boolean.parseBoolean(stringValue);
        }
        return null;
    }
    
    private Long asLong(Object value) {
        if (value instanceof Number numberValue) {
            return numberValue.longValue();
        }
        if (value instanceof String stringValue) {
            try {
                return Long.parseLong(stringValue);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
    
    private Integer asInteger(Object value) {
        if (value instanceof Number numberValue) {
            return numberValue.intValue();
        }
        if (value instanceof String stringValue) {
            try {
                return Integer.parseInt(stringValue);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
    
    private String asString(Object value) {
        return value != null ? value.toString() : null;
    }
    
    /**
     * Verify a KieContainer can fire rules
     * Tests if container can create session and execute rules
     */
    @GetMapping("/containers/verify/{factType}")
    public ResponseEntity<Map<String, Object>> verifyContainer(@PathVariable String factType) {
        Map<String, Object> result = ruleEngineManager.verifyContainer(factType);
        if ((Boolean) result.getOrDefault("success", false)) {
            return ResponseEntity.ok(result);
        } else {
            return ResponseEntity.status(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE).body(result);
        }
    }

    @GetMapping("/active")
    public List<DecisionRule> getActiveRules(@AuthenticationPrincipal UserPrincipal currentUser) {
        String userId = requireUserId(currentUser);
        return decisionRuleRepository.findByStatus(RuleStatus.ACTIVE).stream()
                .filter(rule -> userId.equals(rule.getCreatedBy()))
                .collect(Collectors.toList());
    }

    @GetMapping("/metadata")
    public ResponseEntity<RuleFieldMetadata> getRuleFieldMetadata(
            @RequestParam(required = false, defaultValue = "Declaration") String factType) {
        // INPUT FIELDS - Automatically extracted from entity using reflection based on fact type
        // These fields are from the entity corresponding to the fact type (Declaration, CargoReport, etc.)
        FactType factTypeEnum = FactType.fromValue(factType);
        List<FieldDefinition> inputFields = RuleFieldExtractor.extractInputFields(factTypeEnum.getValue());

        // OUTPUT FIELDS - Automatically extracted from RuleOutputHit entity using reflection
        // UI will display these fields in the THEN section form
        List<FieldDefinition> outputFields = RuleFieldExtractor.extractOutputFields();

        // OPERATORS - Get operators grouped by field type
        var operatorsByType = RuleFieldExtractor.getOperatorsByType();

        RuleFieldMetadata metadata = new RuleFieldMetadata(inputFields, outputFields, operatorsByType);
        return ResponseEntity.ok(metadata);
    }
    
    /**
     * Build Declaration entity from map data using Jackson ObjectMapper
     * This automatically maps all fields from Map to Declaration entity
     * Unknown properties (like factType) are automatically ignored
     */
    private rule.engine.org.app.domain.entity.execution.declaration.Declaration buildDeclarationFromMap(
            Map<String, Object> data) {
        try {
            // Use Jackson ObjectMapper to automatically convert Map to Declaration
            // Configure to ignore unknown properties (like factType which is not a field of Declaration entity)
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
            
            rule.engine.org.app.domain.entity.execution.declaration.Declaration declaration = 
                mapper.convertValue(data, rule.engine.org.app.domain.entity.execution.declaration.Declaration.class);
            
            return declaration;
        } catch (Exception e) {
            log.error("Error converting Map to Declaration: {}", e.getMessage(), e);
            throw new IllegalArgumentException("Invalid Declaration data: " + e.getMessage(), e);
        }
    }
    
    /**
     * Get execution history for a specific declaration
     */
    @GetMapping("/executions/declaration/{declarationId}")
    public ResponseEntity<List<RuleExecutionResponse>> getExecutionsByDeclaration(
            @PathVariable String declarationId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        String userId = requireUserId(currentUser);
        List<RuleExecutionResult> results = executionResultRepository.findByDeclarationId(declarationId);
        List<RuleExecutionResponse> responses = results.stream()
            .filter(result -> result.getDecisionRule() != null
                    && userId.equals(result.getDecisionRule().getCreatedBy()))
            .map(this::toExecutionResponse)
            .collect(Collectors.toList());
        return ResponseEntity.ok(responses);
    }

    /**
     * Get execution history for a specific rule
     */
    @GetMapping("/{ruleId}/executions")
    public ResponseEntity<List<RuleExecutionResponse>> getExecutionsByRule(
            @PathVariable Long ruleId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        enforceRuleOwnership(ruleId, currentUser);
        List<RuleExecutionResult> results = executionResultRepository.findByDecisionRuleId(ruleId);
        List<RuleExecutionResponse> responses = results.stream()
            .map(this::toExecutionResponse)
            .collect(Collectors.toList());
        return ResponseEntity.ok(responses);
    }

    /**
     * Get declarations flagged by a specific rule
     */
    @GetMapping("/{ruleId}/flagged")
    public ResponseEntity<List<RuleExecutionResponse>> getFlaggedByRule(
            @PathVariable Long ruleId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        enforceRuleOwnership(ruleId, currentUser);
        List<RuleExecutionResult> results = executionResultRepository.findFlaggedByRule(ruleId);
        List<RuleExecutionResponse> responses = results.stream()
            .map(this::toExecutionResponse)
            .collect(Collectors.toList());
        return ResponseEntity.ok(responses);
    }

    /**
     * Get count of how many times a rule has fired
     */
    @GetMapping("/{ruleId}/fire-count")
    public ResponseEntity<Long> getRuleFireCount(
            @PathVariable Long ruleId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        enforceRuleOwnership(ruleId, currentUser);
        Long count = executionResultRepository.countRuleFires(ruleId);
        return ResponseEntity.ok(count);
    }

    // ========== VERSION MANAGEMENT ENDPOINTS ==========
    
    /**
     * Get version history for a specific rule
     */
    @GetMapping("/{id}/versions")
    public ResponseEntity<List<DecisionRule>> getRuleVersions(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        String userId = requireUserId(currentUser);
        if (decisionRuleRepository.findByIdAndCreatedBy(id, userId).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        try {
            List<DecisionRule> versions = ruleVersionService.getVersionHistory(id).stream()
                    .filter(rule -> userId.equals(rule.getCreatedBy()))
                    .collect(Collectors.toList());
            return ResponseEntity.ok(versions);
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }
    
    /**
     * Get the latest version of a rule
     */
    @GetMapping("/{id}/versions/latest")
    public ResponseEntity<DecisionRule> getLatestVersion(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        String userId = requireUserId(currentUser);
        return ruleVersionService.getLatestVersion(id)
            .filter(rule -> userId.equals(rule.getCreatedBy()))
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Restore an old version (creates a new version with the same content)
     */
    @PostMapping("/{id}/versions/restore")
    public ResponseEntity<DecisionRule> restoreVersion(
            @PathVariable Long id,
            @RequestBody(required = false) RestoreVersionRequest request) {
        try {
            String versionNotes = request != null ? request.getVersionNotes() : null;
            DecisionRule restored = ruleVersionService.restoreVersion(id, versionNotes);
            // Rebuild rules for this fact type
            FactType factType = restored.getFactType() != null ? restored.getFactType() : FactType.DECLARATION;
            ruleEngineManager.rebuildRules(factType.getValue());
            return ResponseEntity.ok(restored);
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // ========== HELPER METHODS ==========
    
    // Helper method to convert entity to DTO
    private RuleExecutionResponse toExecutionResponse(RuleExecutionResult result) {
        return new RuleExecutionResponse(
            result.getId(),
            result.getDeclarationId(),  // String identifier (not FK)
            result.getDecisionRule().getId(),
            result.getDecisionRule().getRuleName(),
            result.getMatched(),
            result.getRuleAction(),
            result.getRuleResult(),
            result.getRuleScore(),
            result.getExecutedAt()
        );
    }

    private String requireUserId(UserPrincipal currentUser) {
        if (currentUser == null || currentUser.getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User context is missing");
        }
        return currentUser.getId().toString();
    }

    private void enforceRuleOwnership(Long ruleId, UserPrincipal currentUser) {
        String userId = requireUserId(currentUser);
        if (decisionRuleRepository.findByIdAndCreatedBy(ruleId, userId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Rule not found");
        }
    }
    
    /**
     * Helper method to build DecisionRule from request DTO
     * Only maps fields that are part of DecisionRule entity
     */
    private DecisionRule buildRuleFromRequest(CreateRuleRequest request) {
        return buildRuleFromRequestInternal(request);
    }
    
    /**
     * Helper method to build DecisionRule from update request DTO
     */
    private DecisionRule buildRuleFromRequest(UpdateRuleRequest request) {
        return buildRuleFromRequestInternal(request);
    }
    
    /**
     * Internal method to build DecisionRule from request DTO (works with both CreateRuleRequest and UpdateRuleRequest)
     */
    private DecisionRule buildRuleFromRequestInternal(Object request) {
        try {
            // Use Jackson ObjectMapper to convert DTO to DecisionRule
            // Configure to ignore unknown properties (like description, conditions, output which are not fields of DecisionRule entity)
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
            DecisionRule rule = mapper.convertValue(request, DecisionRule.class);
            
            // Set factType if provided (default to DECLARATION)
            FactType factType = null;
            if (request instanceof CreateRuleRequest) {
                factType = ((CreateRuleRequest) request).getFactType();
            } else if (request instanceof UpdateRuleRequest) {
                factType = ((UpdateRuleRequest) request).getFactType();
            }
            
            if (factType != null) {
                rule.setFactType(factType);
            } else {
                rule.setFactType(FactType.DECLARATION); // Default
            }
            
            // IMPORTANT: For new rules (CreateRuleRequest), set defaults
            if (request instanceof CreateRuleRequest) {
                CreateRuleRequest createRequest = (CreateRuleRequest) request;
                rule.setIsLatest(true);
                rule.setVersion(1);
                rule.setParentRuleId(null); // No parent for new rules
                rule.setStatus(RuleStatus.DRAFT); // New rules start as DRAFT
                
                // Set generatedByAi flag if provided in request
                if (createRequest.getGeneratedByAi() != null) {
                    rule.setGeneratedByAi(createRequest.getGeneratedByAi());
                }
            }

            return rule;
        } catch (Exception e) {
            log.error("Error converting request DTO to DecisionRule: {}", e.getMessage(), e);
            throw new IllegalArgumentException("Invalid DecisionRule data: " + e.getMessage(), e);
        }
    }

    /**
     * Build complete DRL (Drools Rule Language) from request DTO
     * Includes package, imports, globals, and rule definition
     */
    private String buildCompleteDrlFromRequest(CreateRuleRequest request, DecisionRule rule) {
        return buildCompleteDrlFromRequestInternal(request, rule);
    }
    
    /**
     * Build complete DRL from update request DTO
     */
    private String buildCompleteDrlFromRequest(UpdateRuleRequest request, DecisionRule rule) {
        return buildCompleteDrlFromRequestInternal(request, rule);
    }
    
    /**
     * Internal method to build complete DRL from request DTO
     */
    private String buildCompleteDrlFromRequestInternal(Object request, DecisionRule rule) {
        // Build WHEN clause from conditions
        FactType factType = rule.getFactType() != null ? rule.getFactType() : FactType.DECLARATION;
        
        List<Map<String, Object>> conditions = null;
        Map<String, Object> output = null;
        
        if (request instanceof CreateRuleRequest) {
            conditions = ((CreateRuleRequest) request).getConditions();
            output = ((CreateRuleRequest) request).getOutput();
        } else if (request instanceof UpdateRuleRequest) {
            conditions = ((UpdateRuleRequest) request).getConditions();
            output = ((UpdateRuleRequest) request).getOutput();
        }
        
        String whenClause = buildWhenClauseFromConditions(conditions, factType.getValue());
        if (whenClause == null || whenClause.isBlank()) {
            return null;
        }
        
        // Build THEN clause from output
        String thenClause = buildThenClauseFromOutput(output, rule);
        if (thenClause == null || thenClause.isBlank()) {
            return null;
        }
        
        // Build complete DRL with package, imports, globals, and rule definition
        StringBuilder drl = new StringBuilder();
        
        // DRL header (package, imports, globals) - import only classes relevant to factType
        drl.append(DrlConstants.buildDrlHeader(factType));
        
        // Rule definition
        String ruleName = rule.getRuleName() != null ? rule.getRuleName() : "Rule";
        // Use placeholder for rule ID if not yet saved (will be updated after save)
        Long ruleId = rule.getId() != null ? rule.getId() : 0L;
        int salience = rule.getPriority() != null ? rule.getPriority() : 0;
        
        drl.append("rule \"").append(ruleName).append("_").append(ruleId).append("\"\n");
        drl.append("salience ").append(salience).append("\n");
        drl.append("when\n");
        drl.append("    ").append(whenClause).append("\n");
        drl.append("then\n");
        drl.append(thenClause);
        drl.append("end\n");
        
        return drl.toString();
    }
    
    /**
     * Build WHEN clause from conditions array
     */
    private String buildWhenClauseFromConditions(List<Map<String, Object>> conditions, String factType) {
        if (conditions == null || conditions.isEmpty()) {
            return null;
        }
        return generateWhenExprFromConditions(conditions, factType);
    }
    
    /**
     * Build THEN clause from output object
     */
    private String buildThenClauseFromOutput(Map<String, Object> output, DecisionRule rule) {
        if (output == null) {
            output = new java.util.HashMap<>();
        }
        
        // Build THEN clause
        StringBuilder then = new StringBuilder();
        
        // Create RuleOutputHit and set fields
        then.append("    RuleOutputHit output = new RuleOutputHit();\n");
        
        String action = output.get("action") != null ? output.get("action").toString() : "FLAG";
        then.append("    output.setAction(\"").append(escapeJavaString(action)).append("\");\n");
        
        String result = output.get("result") != null ? output.get("result").toString()
            : "Rule '" + (rule.getRuleName() != null ? rule.getRuleName() : "Unknown") + "' matched";
        then.append("    output.setResult(\"").append(escapeJavaString(result)).append("\");\n");
        
        Object scoreObj = output.get("score");
        String score = "0";
        if (scoreObj != null) {
            if (scoreObj instanceof Number) {
                score = scoreObj.toString();
            } else {
                score = scoreObj.toString();
            }
        }
        then.append("    output.setScore(new BigDecimal(\"").append(score).append("\"));\n");
        
        // Set optional fields
        if (output.get("flag") != null) {
            then.append("    output.setFlag(\"").append(escapeJavaString(output.get("flag").toString())).append("\");\n");
        }
        if (output.get("documentType") != null) {
            then.append("    output.setDocumentType(\"").append(escapeJavaString(output.get("documentType").toString())).append("\");\n");
        }
        if (output.get("documentId") != null) {
            then.append("    output.setDocumentId(\"").append(escapeJavaString(output.get("documentId").toString())).append("\");\n");
        }
        if (output.get("description") != null) {
            then.append("    output.setDescription(\"").append(escapeJavaString(output.get("description").toString())).append("\");\n");
        }
        
        // Add to totalResults
        then.append("    totalResults.getHits().add(output);\n");
        
        return then.toString();
    }
    
    private String escapeJavaString(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                  .replace("\"", "\\\"")
                  .replace("\n", "\\n")
                  .replace("\r", "\\r")
                  .replace("\t", "\\t");
    }
    
    private String generateWhenExprFromConditions(List<Map<String, Object>> conditions, String factType) {
        if (conditions == null || conditions.isEmpty()) {
            return null;
        }

        // Build a lookup of field types for quoting values correctly
        // Use factType to extract correct fields
        FactType factTypeEnum = factType != null && !factType.isEmpty() 
            ? FactType.fromValue(factType) : FactType.DECLARATION;
        Map<String, String> fieldTypeByName = RuleFieldExtractor.extractInputFields(factTypeEnum.getValue()).stream()
            .collect(Collectors.toMap(FieldDefinition::getName, FieldDefinition::getType, (a, b) -> a));

        // Determine fact type variable and class name based on factType
        String factVariable;
        String factClassName;
        if (factTypeEnum == FactType.CARGO_REPORT) {
            factVariable = "$c";
            factClassName = "CargoReport";
        } else {
            factVariable = "$d";
            factClassName = "Declaration";
        }

        // Separate regular conditions from collection conditions
        List<String> regularConditions = new ArrayList<>();
        List<String> collectionConditions = new ArrayList<>();
        
        for (int i = 0; i < conditions.size(); i++) {
            Map<String, Object> condition = conditions.get(i);
            Object fieldObj = condition.get("field");
            Object operatorObj = condition.get("operator");
            if (fieldObj == null || operatorObj == null) {
                continue;
            }

            String field = fieldObj.toString();
            String operator = operatorObj.toString();
            Object valueObj = condition.get("value");

            String fieldType = fieldTypeByName.getOrDefault(field, "string");
            String valueExpression = buildValueExpression(valueObj, fieldType);

            if (valueExpression == null) {
                continue;
            }

            // Check if field path contains a collection (e.g., cargoReport.consignments.grossMassMeasure)
            String droolsCondition = buildDroolsConditionForField(field, operator, valueExpression, factTypeEnum);
            if (droolsCondition != null) {
                // Collection condition - goes outside fact pattern
                collectionConditions.add(droolsCondition);
            } else {
                // Regular condition - goes inside fact pattern
                String droolsFieldPath = field;
                if (field.startsWith("declaration.")) {
                    droolsFieldPath = "$d." + field.substring("declaration.".length());
                } else if (field.startsWith("cargoReport.")) {
                    droolsFieldPath = "$c." + field.substring("cargoReport.".length());
                }
                regularConditions.add(droolsFieldPath + " " + operator + " " + valueExpression);
            }
        }

        // Build WHEN clause
        StringBuilder whenClause = new StringBuilder();
        
        // Fact pattern with regular conditions
        if (regularConditions.isEmpty() && collectionConditions.isEmpty()) {
            return null;
        }
        
        if (regularConditions.isEmpty()) {
            whenClause.append(factVariable).append(" : ").append(factClassName).append("()");
        } else {
            String regularConditionStr = String.join(" && ", regularConditions);
            whenClause.append(factVariable).append(" : ").append(factClassName).append("(").append(regularConditionStr).append(")");
        }
        
        // Add collection conditions after fact pattern
        if (!collectionConditions.isEmpty()) {
            whenClause.append("\n    ").append(String.join("\n    ", collectionConditions));
        }
        
        return whenClause.toString();
    }
    
    /**
     * Build Drools condition for a field, handling collection fields with 'from' clause.
     * Supports:
     * - Single level collections: entity.collection.field (e.g., cargoReport.consignments.grossMassMeasure)
     * - Nested collections: entity.collection1.collection2.field (e.g., cargoReport.consignments.consignmentItems.hsId)
     * Returns null if field is not a collection field (use simple field access instead).
     */
    private String buildDroolsConditionForField(String fieldPath, String operator, String valueExpression, FactType factType) {
        String[] parts = fieldPath.split("\\.");
        
        // Get fact variable
        String factVariable = (factType == FactType.CARGO_REPORT) ? "$c" : "$d";
        
        // Get entity class
        Class<?> entityClass = entityScannerService.getMainEntityClass(factType);
        if (entityClass == null) {
            return null;
        }
        
        // Case 1: Single level collection (entity.collection.field) - 3 parts
        if (parts.length == 3) {
            String collectionFieldName = parts[1]; // consignments, governmentAgencyGoodsItems, etc.
            String relatedFieldName = parts[2]; // grossMassMeasure, hsId, etc.
            
            return buildSingleLevelCollectionCondition(entityClass, collectionFieldName, relatedFieldName, 
                    operator, valueExpression, factVariable);
        }
        
        // Case 2: Nested collection (entity.collection1.collection2.field) - 4 parts
        if (parts.length == 4) {
            String firstCollectionName = parts[1]; // consignments
            String secondCollectionName = parts[2]; // consignmentItems
            String finalFieldName = parts[3]; // hsId, grossWeightMeasure, etc.
            
            return buildNestedCollectionCondition(entityClass, firstCollectionName, secondCollectionName, 
                    finalFieldName, operator, valueExpression, factVariable);
        }
        
        // Not a collection field path
        return null;
    }
    
    /**
     * Build condition for single level collection: exists Entity(field op value) from $var.collection
     */
    private String buildSingleLevelCollectionCondition(Class<?> entityClass, String collectionFieldName, 
            String relatedFieldName, String operator, String valueExpression, String factVariable) {
        try {
            Field collectionField = entityClass.getDeclaredField(collectionFieldName);
            jakarta.persistence.OneToMany oneToMany = collectionField.getAnnotation(jakarta.persistence.OneToMany.class);
            if (oneToMany == null) {
                return null; // Not a collection field
            }
            
            // Get the related entity class from List<RelatedEntity>
            Type genericType = collectionField.getGenericType();
            if (genericType instanceof ParameterizedType) {
                ParameterizedType paramType = (ParameterizedType) genericType;
                Type[] actualTypes = paramType.getActualTypeArguments();
                if (actualTypes.length > 0 && actualTypes[0] instanceof Class) {
                    Class<?> relatedEntityClass = (Class<?>) actualTypes[0];
                    String relatedEntityClassName = relatedEntityClass.getSimpleName();
                    
                    // Generate Drools syntax: exists EntityClass(fieldName operator value) from $variable.collectionName
                    return "exists " + relatedEntityClassName + "(" + relatedFieldName + " " + operator + " " + valueExpression + ") from " + factVariable + "." + collectionFieldName;
                }
            }
        } catch (NoSuchFieldException e) {
            log.debug("Field {} not found in entity class {}", collectionFieldName, entityClass.getSimpleName());
            return null;
        }
        
        return null;
    }
    
    /**
     * Build condition for nested collection: exists Entity1(exists Entity2(field op value) from collection2) from $var.collection1
     */
    private String buildNestedCollectionCondition(Class<?> entityClass, String firstCollectionName, 
            String secondCollectionName, String finalFieldName, String operator, String valueExpression, String factVariable) {
        try {
            // Get first collection field
            Field firstCollectionField = entityClass.getDeclaredField(firstCollectionName);
            jakarta.persistence.OneToMany firstOneToMany = firstCollectionField.getAnnotation(jakarta.persistence.OneToMany.class);
            if (firstOneToMany == null) {
                return null;
            }
            
            // Get the first related entity class
            Type firstGenericType = firstCollectionField.getGenericType();
            if (!(firstGenericType instanceof ParameterizedType)) {
                return null;
            }
            
            ParameterizedType firstParamType = (ParameterizedType) firstGenericType;
            Type[] firstActualTypes = firstParamType.getActualTypeArguments();
            if (firstActualTypes.length == 0 || !(firstActualTypes[0] instanceof Class)) {
                return null;
            }
            
            Class<?> firstRelatedEntityClass = (Class<?>) firstActualTypes[0];
            
            // Get second collection field from first related entity
            Field secondCollectionField = firstRelatedEntityClass.getDeclaredField(secondCollectionName);
            jakarta.persistence.OneToMany secondOneToMany = secondCollectionField.getAnnotation(jakarta.persistence.OneToMany.class);
            if (secondOneToMany == null) {
                return null;
            }
            
            // Get the second related entity class
            Type secondGenericType = secondCollectionField.getGenericType();
            if (!(secondGenericType instanceof ParameterizedType)) {
                return null;
            }
            
            ParameterizedType secondParamType = (ParameterizedType) secondGenericType;
            Type[] secondActualTypes = secondParamType.getActualTypeArguments();
            if (secondActualTypes.length == 0 || !(secondActualTypes[0] instanceof Class)) {
                return null;
            }
            
            Class<?> secondRelatedEntityClass = (Class<?>) secondActualTypes[0];
            String firstEntityClassName = firstRelatedEntityClass.getSimpleName();
            String secondEntityClassName = secondRelatedEntityClass.getSimpleName();
            
            // Generate nested Drools syntax:
            // exists FirstEntity(exists SecondEntity(field op value) from secondCollection) from $var.firstCollection
            String innerCondition = "exists " + secondEntityClassName + "(" + finalFieldName + " " + operator + " " + valueExpression + ") from " + secondCollectionName;
            return "exists " + firstEntityClassName + "(" + innerCondition + ") from " + factVariable + "." + firstCollectionName;
            
        } catch (NoSuchFieldException e) {
            log.debug("Nested collection field not found: {} -> {}", firstCollectionName, secondCollectionName);
            return null;
        }
    }
    
    private String buildValueExpression(Object valueObj, String fieldType) {
        if (valueObj == null) {
            return "null";
        }

        switch (fieldType) {
            case "integer":
            case "decimal":
                return valueObj.toString();
            case "boolean":
                return String.valueOf(valueObj);
            default:
                String escaped = valueObj.toString()
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"");
                return "\"" + escaped + "\"";
        }
    }
    
    /**
     * Parse and save rule conditions from request body
     * Supports structured format (conditions array)
     */
    @org.springframework.transaction.annotation.Transactional
    private void saveRuleConditions(DecisionRule rule, List<Map<String, Object>> conditions) {
        // Delete existing conditions first
        List<RuleConditionGroup> existingGroups = conditionGroupRepository.findByDecisionRuleIdOrderByOrderIndexAsc(rule.getId());
        for (RuleConditionGroup group : existingGroups) {
            conditionRepository.deleteAll(conditionRepository.findByGroupOrderByOrderIndexAsc(group));
        }
        conditionGroupRepository.deleteAll(existingGroups);
        
        // Parse conditions from structured format
        if (conditions != null && !conditions.isEmpty()) {
                // Group conditions by logical operator (AND/OR)
                // Create groups based on logicalOp transitions
                RuleConditionGroup currentGroup = null;
                RuleGroupType currentGroupType = RuleGroupType.AND;
                int groupOrderIndex = 0;
                int conditionOrderIndex = 0;
                
                for (Map<String, Object> cond : conditions) {
                    if (!cond.containsKey("field") || !cond.containsKey("operator") || !cond.containsKey("value")) {
                        continue;
                    }
                    
                    // Get logical operator for this condition (default to AND)
                    String logicalOp = (String) cond.getOrDefault("logicalOp", "AND");
                    RuleGroupType groupType = "OR".equals(logicalOp) ? RuleGroupType.OR : RuleGroupType.AND;
                    
                    // Create new group if operator changed or first condition
                    if (currentGroup == null || !currentGroupType.equals(groupType)) {
                        currentGroup = new RuleConditionGroup();
                        currentGroup.setDecisionRule(rule);
                        currentGroup.setType(groupType);
                        currentGroup.setOrderIndex(groupOrderIndex++);
                        currentGroup = conditionGroupRepository.save(currentGroup);
                        currentGroupType = groupType;
                        conditionOrderIndex = 0; // Reset condition order within group
                    }
                    
                    // Parse and save condition
                    RuleCondition condition = parseConditionFromMap(cond, currentGroup, conditionOrderIndex++);
                    conditionRepository.save(condition);
                }
            }
        }
    
    /**
     * Map operator string to RuleOperatorType enum
     */
    private RuleOperatorType mapOperator(String operatorStr) {
        return switch (operatorStr) {
            case "==" -> RuleOperatorType.EQUALS;
            case "!=" -> RuleOperatorType.NOT_EQUALS;
            case ">" -> RuleOperatorType.GT;
            case ">=" -> RuleOperatorType.GTE;
            case "<" -> RuleOperatorType.LT;
            case "<=" -> RuleOperatorType.LTE;
            case "contains" -> RuleOperatorType.STR_CONTAINS;
            case "startsWith" -> RuleOperatorType.STR_STARTS_WITH;
            case "endsWith" -> RuleOperatorType.STR_ENDS_WITH;
            default -> RuleOperatorType.EQUALS;
        };
    }
    
    /**
     * Parse condition from structured map format
     */
    private RuleCondition parseConditionFromMap(Map<String, Object> cond, RuleConditionGroup group, int orderIndex) {
        RuleCondition condition = new RuleCondition();
        condition.setGroup(group);
        condition.setFieldPath((String) cond.get("field"));
        condition.setOrderIndex(orderIndex);
        
        // Map operator
        String operatorStr = (String) cond.get("operator");
        condition.setOperator(mapOperator(operatorStr));
        
        // Parse value
        Object value = cond.get("value");
        if (value == null) {
            condition.setValueType(RuleValueType.STRING);
            condition.setValueText(null);
        } else if (value instanceof String) {
            condition.setValueType(RuleValueType.STRING);
            condition.setValueText((String) value);
        } else if (value instanceof Number) {
            if (value instanceof Integer || value instanceof Long) {
                condition.setValueType(RuleValueType.INT);
                condition.setValueNumber(((Number) value).longValue());
            } else {
                condition.setValueType(RuleValueType.BIG_DECIMAL);
                condition.setValueDecimal(new java.math.BigDecimal(value.toString()));
            }
        } else if (value instanceof Boolean) {
            condition.setValueType(RuleValueType.BOOLEAN);
            condition.setValueBoolean((Boolean) value);
        } else {
            condition.setValueType(RuleValueType.STRING);
            condition.setValueText(value.toString());
        }
        
        return condition;
    }
    
    /**
     * Parse and save rule outputs from request body
     */
    @org.springframework.transaction.annotation.Transactional
    private void saveRuleOutputs(DecisionRule rule, Map<String, Object> outputMap) {
        // Delete existing outputs and groups first
        List<RuleOutput> existingOutputs = outputRepository.findByDecisionRuleIdOrderByOrderIndexAsc(rule.getId());
        outputRepository.deleteAll(existingOutputs);
        List<RuleOutputGroup> existingGroups = outputGroupRepository.findByDecisionRuleIdOrderByOrderIndexAsc(rule.getId());
        outputGroupRepository.deleteAll(existingGroups);
        
        if (outputMap != null) {
            // Create output group first
            RuleOutputGroup outputGroup = new RuleOutputGroup();
            outputGroup.setDecisionRule(rule);
            outputGroup.setType(RuleGroupType.AND);
            outputGroup.setOrderIndex(0);
            outputGroup = outputGroupRepository.save(outputGroup);
            
            // Convert Map to DTO using ObjectMapper
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            RuleOutputRequest outputRequest = mapper.convertValue(outputMap, RuleOutputRequest.class);
            
            // Create RuleOutput entity from DTO
            RuleOutput ruleOutput = new RuleOutput();
            ruleOutput.setGroup(outputGroup);
            ruleOutput.setDecisionRule(rule);
            ruleOutput.setOrderIndex(0);
            ruleOutput.setAction(outputRequest.getAction());
            ruleOutput.setResult(outputRequest.getResult());
            ruleOutput.setScore(outputRequest.getScore());
            ruleOutput.setFlag(outputRequest.getFlag());
            ruleOutput.setDocumentType(outputRequest.getDocumentType());
            ruleOutput.setDocumentId(outputRequest.getDocumentId());
            ruleOutput.setDescription(outputRequest.getDescription());
            
            outputRepository.save(ruleOutput);
        }
    }
    
    /**
     * Build RuleResponse DTO from DecisionRule entity
     * Response includes all request fields plus id and timestamps
     */
    private RuleResponse buildRuleResponse(DecisionRule rule, CreateRuleRequest request) {
        return buildRuleResponseInternal(rule, request);
    }
    
    /**
     * Build RuleResponse DTO from DecisionRule entity with update request
     */
    private RuleResponse buildRuleResponse(DecisionRule rule, UpdateRuleRequest request) {
        return buildRuleResponseInternal(rule, request);
    }
    
    /**
     * Internal method to build RuleResponse from DecisionRule and optional request DTO
     */
    private RuleResponse buildRuleResponseInternal(DecisionRule rule, Object request) {
        RuleResponse.RuleResponseBuilder responseBuilder = RuleResponse.builder()
            .id(rule.getId())
            .ruleName(rule.getRuleName())
            .label(rule.getLabel())
            .factType(rule.getFactType() != null ? rule.getFactType().getValue() : null)
            .ruleContent(rule.getRuleContent())
            .priority(rule.getPriority())
            .status(rule.getStatus() != null ? rule.getStatus().name() : RuleStatus.DRAFT.name())
            .generatedByAi(rule.getGeneratedByAi())
            .version(rule.getVersion())
            .parentRuleId(rule.getParentRuleId())
            .isLatest(rule.getIsLatest())
            .versionNotes(rule.getVersionNotes())
            .createdAt(rule.getCreatedAt())
            .updatedAt(rule.getUpdatedAt())
            .createdBy(rule.getCreatedBy())
            .updatedBy(rule.getUpdatedBy());
        
        // Extract fields from request DTO if provided
        String description = null;
        List<Map<String, Object>> conditions = null;
        Map<String, Object> output = null;
        
        if (request instanceof CreateRuleRequest) {
            CreateRuleRequest createRequest = (CreateRuleRequest) request;
            description = createRequest.getDescription();
            conditions = createRequest.getConditions();
            output = createRequest.getOutput();
        } else if (request instanceof UpdateRuleRequest) {
            UpdateRuleRequest updateRequest = (UpdateRuleRequest) request;
            description = updateRequest.getDescription();
            conditions = updateRequest.getConditions();
            output = updateRequest.getOutput();
        }
        
        // Include description from request or reconstruct from RuleOutput entities
        if (description != null) {
            responseBuilder.description(description);
        } else {
            // Try to get description from RuleOutput entities first
            List<RuleOutput> outputs = outputRepository.findByDecisionRuleIdOrderByOrderIndexAsc(rule.getId());
            if (!outputs.isEmpty()) {
                RuleOutput firstOutput = outputs.get(0);
                // Use description if available, otherwise use result
                String outputDescription = firstOutput.getDescription() != null 
                    ? firstOutput.getDescription() 
                    : (firstOutput.getResult() != null ? firstOutput.getResult() : "");
                responseBuilder.description(outputDescription);
            } else {
                // No outputs exist - use empty string (deprecated ruleResult field should not be used)
                responseBuilder.description("");
            }
        }
        
        // Include conditions from request (or reconstruct from saved conditions)
        if (conditions != null) {
            responseBuilder.conditions(conditions);
        } else {
            // Reconstruct conditions from saved RuleCondition entities
            List<Map<String, Object>> reconstructedConditions = reconstructConditionsFromRule(rule);
            responseBuilder.conditions(reconstructedConditions);
        }
        
        // Include output from request (or reconstruct from saved outputs)
        if (output != null) {
            responseBuilder.output(output);
        } else {
            // Reconstruct output from saved RuleOutput entities
            Map<String, Object> reconstructedOutput = reconstructOutputFromRule(rule);
            responseBuilder.output(reconstructedOutput);
        }
        
        return responseBuilder.build();
    }
    
    /**
     * Reconstruct conditions array from saved RuleCondition entities
     */
    private List<Map<String, Object>> reconstructConditionsFromRule(DecisionRule rule) {
        List<Map<String, Object>> conditions = new java.util.ArrayList<>();
        
        try {
            // Use decisionRuleId instead of DecisionRule object to avoid object reference issues
            List<RuleConditionGroup> groups = conditionGroupRepository.findByDecisionRuleIdOrderByOrderIndexAsc(rule.getId());
            log.debug("Found {} condition groups for rule {}", groups.size(), rule.getId());
            
            for (RuleConditionGroup group : groups) {
                List<RuleCondition> groupConditions = conditionRepository.findByGroupOrderByOrderIndexAsc(group);
                log.debug("Found {} conditions in group {} for rule {}", groupConditions.size(), group.getId(), rule.getId());
                
                for (RuleCondition cond : groupConditions) {
                    // Build ConditionResponse DTO
                    ConditionResponse conditionResponse = ConditionResponse.builder()
                        .field(cond.getFieldPath())
                        .operator(mapOperatorToString(cond.getOperator()))
                        .value(extractValueFromCondition(cond))
                        .logicalOp(group.getType() == RuleGroupType.OR ? "OR" : "AND")
                        .build();
                    
                    // Convert DTO to Map for response (response expects List<Map<String, Object>>)
                    com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                    @SuppressWarnings("unchecked")
                    Map<String, Object> conditionMap = mapper.convertValue(conditionResponse, Map.class);
                    conditions.add(conditionMap);
                }
            }
        } catch (Exception ex) {
            log.error("Error reconstructing conditions for rule {}: {}", rule.getId(), ex.getMessage(), ex);
        }
        
        return conditions;
    }
    
    /**
     * Reconstruct output object from saved RuleOutput entities
     */
    private Map<String, Object> reconstructOutputFromRule(DecisionRule rule) {
        List<RuleOutput> outputs = outputRepository.findByDecisionRuleIdOrderByOrderIndexAsc(rule.getId());
        
        RuleOutputRequest outputRequest;
        if (!outputs.isEmpty()) {
            RuleOutput ruleOutput = outputs.get(0);
            // Build DTO from RuleOutput entity
            outputRequest = RuleOutputRequest.builder()
                .action(ruleOutput.getAction())
                .score(ruleOutput.getScore())
                .result(ruleOutput.getResult())
                .flag(ruleOutput.getFlag())
                .documentType(ruleOutput.getDocumentType())
                .documentId(ruleOutput.getDocumentId())
                .description(ruleOutput.getDescription())
                .build();
        } else {
            // No outputs exist - return empty DTO (deprecated fields should not be used)
            outputRequest = RuleOutputRequest.builder()
                .action(null)
                .score(null)
                .result(null)
                .flag(null)
                .documentType(null)
                .documentId(null)
                .description(null)
                .build();
        }
        
        // Convert DTO to Map for response (response expects Map<String, Object>)
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        @SuppressWarnings("unchecked")
        Map<String, Object> output = mapper.convertValue(outputRequest, Map.class);
        
        return output;
    }
    
    /**
     * Map RuleOperatorType enum to string operator
     */
    private String mapOperatorToString(RuleOperatorType operator) {
        return switch (operator) {
            case EQUALS -> "==";
            case NOT_EQUALS -> "!=";
            case GT -> ">";
            case GTE -> ">=";
            case LT -> "<";
            case LTE -> "<=";
            case STR_CONTAINS -> "contains";
            case STR_STARTS_WITH -> "startsWith";
            case STR_ENDS_WITH -> "endsWith";
            default -> "==";
        };
    }
    
    /**
     * Extract value from RuleCondition based on value type
     */
    private Object extractValueFromCondition(RuleCondition condition) {
        return switch (condition.getValueType()) {
            case STRING -> condition.getValueText();
            case INT -> condition.getValueNumber();
            case BIG_DECIMAL -> condition.getValueDecimal();
            case BOOLEAN -> condition.getValueBoolean();
            default -> condition.getValueText();
        };
    }
    
    // ==================== VERSION SNAPSHOT ENDPOINTS ====================
    
    /**
     * Get all rules deployed in a specific version
     * 
     * Example: GET /api/v1/rules/versions/2/snapshot?factType=Declaration
     * Returns list of rules that were deployed in version 2
     */
    @GetMapping("/versions/{version}/snapshot")
    public ResponseEntity<?> getVersionSnapshot(
            @PathVariable Integer version,
            @RequestParam(required = false, defaultValue = "Declaration") String factType) {
        try {
            FactType factTypeEnum = FactType.fromValue(factType);
            rule.engine.org.app.domain.repository.RuleDeploymentSnapshotRepository snapshotRepo =
                applicationContext.getBean(rule.engine.org.app.domain.repository.RuleDeploymentSnapshotRepository.class);
            
            List<rule.engine.org.app.domain.entity.ui.RuleDeploymentSnapshot> snapshots = 
                snapshotRepo.findByFactTypeAndContainerVersionOrderByRulePriorityAsc(factTypeEnum, version);
            
            Map<String, Object> response = Map.of(
                "version", version,
                "factType", factType,
                "ruleCount", snapshots.size(),
                "rules", snapshots.stream().map(s -> Map.of(
                    "id", s.getRuleId(),
                    "name", s.getRuleName(),
                    "version", s.getRuleVersion(),
                    "priority", s.getRulePriority(),
                    "active", s.getRuleActive()
                )).collect(Collectors.toList())
            );
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to get version snapshot", e);
            return ResponseEntity.internalServerError()
                .body(ErrorResponse.builder()
                    .success(false)
                    .error(e.getMessage())
                    .build());
        }
    }
    
    /**
     * Get all available versions for a fact type
     * 
     * Example: GET /api/v1/rules/versions?factType=Declaration
     * Returns: [5, 4, 3, 2, 1]
     */
    @GetMapping("/versions")
    public ResponseEntity<?> getAvailableVersions(
            @RequestParam(required = false, defaultValue = "Declaration") String factType) {
        try {
            FactType factTypeEnum = FactType.fromValue(factType);
            rule.engine.org.app.domain.repository.RuleDeploymentSnapshotRepository snapshotRepo =
                applicationContext.getBean(rule.engine.org.app.domain.repository.RuleDeploymentSnapshotRepository.class);
            
            List<Integer> versions = snapshotRepo.findDistinctContainerVersionsByFactType(factTypeEnum);
            
            return ResponseEntity.ok(Map.of(
                "factType", factType,
                "versions", versions
            ));
        } catch (Exception e) {
            log.error("Failed to get available versions", e);
            return ResponseEntity.internalServerError()
                .body(ErrorResponse.builder()
                    .success(false)
                    .error(e.getMessage())
                    .build());
        }
    }
    
    /**
     * Compare two versions to see what changed
     * 
     * Example: GET /api/v1/rules/versions/compare?from=1&to=2&factType=Declaration
     * Returns: added, removed, and common rules
     */
    @GetMapping("/versions/compare")
    public ResponseEntity<?> compareVersions(
            @RequestParam Integer from,
            @RequestParam Integer to,
            @RequestParam(required = false, defaultValue = "Declaration") String factType) {
        try {
            FactType factTypeEnum = FactType.fromValue(factType);
            rule.engine.org.app.domain.repository.RuleDeploymentSnapshotRepository snapshotRepo =
                applicationContext.getBean(rule.engine.org.app.domain.repository.RuleDeploymentSnapshotRepository.class);
            
            List<rule.engine.org.app.domain.entity.ui.RuleDeploymentSnapshot> fromSnapshots = 
                snapshotRepo.findByFactTypeAndContainerVersionOrderByRulePriorityAsc(factTypeEnum, from);
            List<rule.engine.org.app.domain.entity.ui.RuleDeploymentSnapshot> toSnapshots = 
                snapshotRepo.findByFactTypeAndContainerVersionOrderByRulePriorityAsc(factTypeEnum, to);
            
            java.util.Set<Long> fromRuleIds = fromSnapshots.stream()
                .map(rule.engine.org.app.domain.entity.ui.RuleDeploymentSnapshot::getRuleId)
                .collect(Collectors.toSet());
            java.util.Set<Long> toRuleIds = toSnapshots.stream()
                .map(rule.engine.org.app.domain.entity.ui.RuleDeploymentSnapshot::getRuleId)
                .collect(Collectors.toSet());
            
            List<Map<String, Object>> added = toSnapshots.stream()
                .filter(s -> !fromRuleIds.contains(s.getRuleId()))
                .map(s -> Map.of(
                    "id", (Object) s.getRuleId(),
                    "name", s.getRuleName(),
                    "version", s.getRuleVersion(),
                    "priority", s.getRulePriority()
                ))
                .collect(Collectors.toList());
            
            List<Map<String, Object>> removed = fromSnapshots.stream()
                .filter(s -> !toRuleIds.contains(s.getRuleId()))
                .map(s -> Map.of(
                    "id", (Object) s.getRuleId(),
                    "name", s.getRuleName(),
                    "version", s.getRuleVersion(),
                    "priority", s.getRulePriority()
                ))
                .collect(Collectors.toList());
            
            List<Map<String, Object>> common = toSnapshots.stream()
                .filter(s -> fromRuleIds.contains(s.getRuleId()))
                .map(s -> Map.of(
                    "id", (Object) s.getRuleId(),
                    "name", s.getRuleName(),
                    "version", s.getRuleVersion(),
                    "priority", s.getRulePriority()
                ))
                .collect(Collectors.toList());
            
            return ResponseEntity.ok(Map.of(
                "from", from,
                "to", to,
                "factType", factType,
                "added", added,
                "removed", removed,
                "common", common,
                "summary", Map.of(
                    "fromRuleCount", fromSnapshots.size(),
                    "toRuleCount", toSnapshots.size(),
                    "addedCount", added.size(),
                    "removedCount", removed.size(),
                    "commonCount", common.size()
                )
            ));
        } catch (Exception e) {
            log.error("Failed to compare versions", e);
            return ResponseEntity.internalServerError()
                .body(ErrorResponse.builder()
                    .success(false)
                    .error(e.getMessage())
                    .build());
        }
    }
    
    /**
     * Activate a specific version
     * This allows switching to any historical version
     * 
     * Example: POST /api/v1/rules/versions/3/activate
     * Body: { "factType": "Declaration", "createNewVersion": true, "activationNotes": "Rollback to stable version" }
     */
    @PostMapping("/versions/{version}/activate")
    public ResponseEntity<?> activateVersion(
            @PathVariable Integer version,
            @RequestBody rule.engine.org.app.api.request.ActivateVersionRequest request) {
        try {
            if (request.getFactType() == null || request.getFactType().isEmpty()) {
                request.setFactType("Declaration");
            }
            
            FactType factTypeEnum = FactType.fromValue(request.getFactType());
            boolean createNewVersion = request.getCreateNewVersion() != null ? request.getCreateNewVersion() : false;
            
            rule.engine.org.app.domain.service.VersionActivationService activationService =
                applicationContext.getBean(rule.engine.org.app.domain.service.VersionActivationService.class);
            
            rule.engine.org.app.domain.service.VersionActivationService.VersionActivationResult result =
                activationService.activateVersion(factTypeEnum, version, createNewVersion, request.getActivationNotes());
            
            // Check if activation failed
            if (result.getSuccess() == null || !result.getSuccess()) {
                return ResponseEntity.badRequest()
                    .body(ErrorResponse.builder()
                        .success(false)
                        .error(result.getMessage())
                        .build());
            }
            
            // Success - build response (using HashMap to avoid null value issues with Map.of)
            java.util.Map<String, Object> response = new java.util.HashMap<>();
            response.put("success", result.getSuccess());
            response.put("message", result.getMessage());
            response.put("targetVersion", result.getTargetVersion());
            response.put("factType", result.getFactType());
            response.put("createdNewVersion", result.getCreatedNewVersion());
            response.put("deactivatedRules", result.getDeactivatedRules());
            response.put("activatedRules", result.getActivatedRules());
            response.put("notFoundRules", result.getNotFoundRules());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            log.error("Failed to activate version {}", version, e);
            return ResponseEntity.internalServerError()
                .body(ErrorResponse.builder()
                    .success(false)
                    .error(e.getMessage())
                    .build());
        }
    }
    
    // ApplicationContext for bean lookup (injected via setter)
    private org.springframework.context.ApplicationContext applicationContext;
    
    @org.springframework.beans.factory.annotation.Autowired
    public void setApplicationContext(org.springframework.context.ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }
}
