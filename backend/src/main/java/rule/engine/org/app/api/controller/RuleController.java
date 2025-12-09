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
import rule.engine.org.app.api.request.ConditionsGroup;
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
import rule.engine.org.app.domain.entity.security.UserRole;
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
import rule.engine.org.app.domain.service.UserDisplayNameService;
import rule.engine.org.app.domain.entity.ui.KieContainerVersion;
import rule.engine.org.app.api.request.AIGenerateRuleRequest;
import rule.engine.org.app.api.request.BatchAIGenerateRuleRequest;
import rule.engine.org.app.api.request.BatchCreateRulesRequest;
import rule.engine.org.app.api.response.AIGenerateRuleResponse;
import rule.engine.org.app.api.response.BatchAIGenerateRuleResponse;
import rule.engine.org.app.api.response.BatchCreateRulesResponse;
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
    private final UserDisplayNameService userDisplayNameService;

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
                        EntityScannerService entityScannerService,
                        UserDisplayNameService userDisplayNameService) {
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
        this.userDisplayNameService = userDisplayNameService;
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
     * Execute rules with entity data (Declaration, CargoReport, Traveler, etc.)
     * This endpoint accepts entity data and fires all matching rules
     * Supports testing with a specific version by passing "version" parameter
     * IMPORTANT: This endpoint must be placed BEFORE endpoints with path variables like /{id} or /{ruleId}/executions
     * to avoid path matching conflicts (Spring may match /execute with /{ruleId}/executions)
     */
    @PostMapping(value = "/execute", consumes = org.springframework.http.MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> executeRules(
            @RequestBody Map<String, Object> entityData,
            @RequestParam(required = false) Long version,
            @RequestHeader(value = "X-Execution-Source", required = false, defaultValue = "API") String executionSource) {
        try {
            // Validate execution source
            if (!executionSource.equals("API") && !executionSource.equals("UI")) {
                executionSource = "API"; // Default to API if invalid
            }
            
            // Get fact type from entity data or default to "Declaration"
            String factTypeStr = (String) entityData.getOrDefault("factType", "Declaration");
            FactType factType = FactType.fromValue(factTypeStr);
            
            // Convert map to entity using generic builder
            Object entity = buildEntityFromMap(entityData, factType);
            
            // Extract identifier from entity
            String entityId = extractEntityIdentifier(entity, factType);
            
            // Fire rules using RuleEngineManager
            rule.engine.org.app.domain.entity.execution.TotalRuleResults results;
            
            if (version != null && version > 0) {
                // Execute with specific version
                results = ruleEngineManager.fireRulesWithVersion(factType.getValue(), entity, version);
            } else {
                // Execute with current version
                results = ruleEngineManager.fireRules(factType.getValue(), entity);
            }
            
            // Save execution results with source tracking
            saveExecutionResults(entityId, factType, results, executionSource);
            
            // Build response using DTO factory method
            RuleExecuteResponse response = RuleExecuteResponse.from(results, entityId);
            
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
     * Batch AI-powered rule generation endpoint.
     * Accepts multiple natural language inputs and generates structured rules using AI in a single API call.
     * This is more efficient than calling the single endpoint multiple times as it reduces token usage.
     * IMPORTANT: This endpoint must be placed BEFORE the single ai-generate endpoint to avoid path conflicts.
     */
    @PostMapping(value = "/ai-generate/batch", consumes = org.springframework.http.MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<BatchAIGenerateRuleResponse> batchGenerateRulesFromNaturalLanguage(
            @RequestBody BatchAIGenerateRuleRequest request) {
        if (request == null || request.getRequests() == null || request.getRequests().isEmpty()) {
            BatchAIGenerateRuleResponse errorResponse = BatchAIGenerateRuleResponse.builder()
                .success(false)
                .total(0)
                .successful(0)
                .failed(0)
                .results(List.of())
                .build();
            return ResponseEntity.badRequest().body(errorResponse);
        }

        List<AIGenerateRuleResponse> results = new java.util.ArrayList<>();
        int successful = 0;
        int failed = 0;

        // Use common fact type and context if provided, otherwise use from individual requests
        String commonFactType = request.getFactType();
        String commonAdditionalContext = request.getAdditionalContext();

        for (AIGenerateRuleRequest singleRequest : request.getRequests()) {
            try {
                // Override fact type and context if provided at batch level
                if (commonFactType != null) {
                    singleRequest.setFactType(commonFactType);
                }
                if (commonAdditionalContext != null) {
                    singleRequest.setAdditionalContext(commonAdditionalContext);
                }
                
                // Generate rule using existing service
                AIGenerateRuleResponse response = aiRuleGeneratorService.generateRule(singleRequest);
                
                if (response.getSuccess() && response.getValidation() != null && response.getValidation().getValid()) {
                    successful++;
                } else {
                    failed++;
                }
                
                results.add(response);
                
            } catch (Exception e) {
                log.error("Error generating rule in batch: {}", e.getMessage(), e);
                failed++;
                AIGenerateRuleResponse errorResponse = AIGenerateRuleResponse.builder()
                    .success(false)
                    .errorMessage("Failed to generate rule: " + e.getMessage())
                    .suggestions(List.of(
                        "Please try rephrasing your request",
                        "Ensure AI API (OpenRouter/OpenAI) is properly configured"
                    ))
                    .build();
                results.add(errorResponse);
            }
        }

        BatchAIGenerateRuleResponse batchResponse = BatchAIGenerateRuleResponse.builder()
            .success(failed == 0)
            .total(request.getRequests().size())
            .successful(successful)
            .failed(failed)
            .results(results)
            .build();

        return ResponseEntity.ok(batchResponse);
    }

    /**
     * AI-powered rule generation endpoint.
     * Accepts natural language input and generates a structured rule using AI (OpenRouter or OpenAI).
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
                    "Ensure AI API (OpenRouter/OpenAI) is properly configured",
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
        Optional<DecisionRule> ruleOpt = isAdministrator(currentUser)
            ? decisionRuleRepository.findById(id)
            : decisionRuleRepository.findByIdAndCreatedBy(id, userId);
        
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

    /**
     * Batch create multiple rules in a single API call.
     * Returns results for each rule (success or error) in a single response.
     * IMPORTANT: This endpoint must be placed BEFORE the single create endpoint to avoid path conflicts.
     */
    @PostMapping("/batch")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<?> batchCreateRules(@RequestBody BatchCreateRulesRequest request) {
        if (request == null || request.getRules() == null || request.getRules().isEmpty()) {
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error("Rules list cannot be empty")
                .errorType("ValidationException")
                .build();
            return ResponseEntity.badRequest().body(errorResponse);
        }

        List<BatchCreateRulesResponse.RuleSaveResult> results = new java.util.ArrayList<>();
        int successful = 0;
        int failed = 0;
        FactType factType = null;

        for (int i = 0; i < request.getRules().size(); i++) {
            CreateRuleRequest ruleRequest = request.getRules().get(i);
            BatchCreateRulesResponse.RuleSaveResult result = BatchCreateRulesResponse.RuleSaveResult.builder()
                .index(i)
                .ruleName(ruleRequest.getRuleName())
                .success(false)
                .build();

            try {
                // Build DecisionRule from request DTO
                DecisionRule rule = buildRuleFromRequest(ruleRequest);
                
                // Check for duplicate rule name (only check latest versions)
                if (rule.getRuleName() != null) {
                    Optional<DecisionRule> existingRule = decisionRuleRepository.findByRuleNameAndIsLatestTrue(rule.getRuleName());
                    if (existingRule.isPresent()) {
                        result.setSuccess(false);
                        result.setError("Rule name already exists: " + rule.getRuleName());
                        result.setErrorType("ValidationException");
                        failed++;
                        results.add(result);
                        continue;
                    }
                }
                
                // Track fact type for rebuild (use first rule's fact type)
                if (factType == null && rule.getFactType() != null) {
                    factType = rule.getFactType();
                }
                
                // Generate ruleContent before saving
                String ruleContent = buildCompleteDrlFromRequest(ruleRequest, rule);
                if (ruleContent == null || ruleContent.isBlank()) {
                    result.setSuccess(false);
                    result.setError("Failed to generate rule content: conditions or output are required");
                    result.setErrorType("ValidationException");
                    failed++;
                    results.add(result);
                    continue;
                }
                rule.setRuleContent(ruleContent);
                
                // Save DecisionRule
                DecisionRule saved = decisionRuleRepository.save(rule);
                
                // Rebuild ruleContent with correct rule ID
                if (saved.getId() != null && saved.getId() != 0L) {
                    String updatedRuleContent = buildCompleteDrlFromRequest(ruleRequest, saved);
                    if (updatedRuleContent != null && !updatedRuleContent.isBlank()) {
                        saved.setRuleContent(updatedRuleContent);
                        saved = decisionRuleRepository.save(saved);
                    }
                }
                
                // Parse and save conditions if provided
                if (ruleRequest.getConditions() != null && !ruleRequest.getConditions().isEmpty()) {
                    try {
                        saveRuleConditions(saved, ruleRequest.getConditions());
                        conditionGroupRepository.flush();
                        conditionRepository.flush();
                    } catch (Exception ex) {
                        log.error("Failed to persist structured conditions for rule {}: {}", saved.getRuleName(), ex.getMessage(), ex);
                        result.setSuccess(false);
                        result.setError("Failed to save rule conditions: " + ex.getMessage());
                        result.setErrorType(ex.getClass().getSimpleName());
                        failed++;
                        results.add(result);
                        continue;
                    }
                }
                
                // Parse and save outputs if provided
                if (ruleRequest.getOutput() != null) {
                    try {
                        saveRuleOutputs(saved, ruleRequest.getOutput());
                        outputRepository.flush();
                    } catch (Exception ex) {
                        log.warn("Failed to persist rule outputs for rule {}: {}", saved.getRuleName(), ex.getMessage());
                        // Output errors are non-critical, continue
                    }
                }
                
                // Mark as successful
                result.setSuccess(true);
                result.setRuleId(saved.getId());
                successful++;
                results.add(result);
                
            } catch (Exception e) {
                log.error("Error creating rule at index {}: {}", i, e.getMessage(), e);
                result.setSuccess(false);
                result.setError(e.getMessage() != null ? e.getMessage() : "Failed to create rule: " + e.getClass().getSimpleName());
                result.setErrorType(e.getClass().getSimpleName());
                failed++;
                results.add(result);
            }
        }
        
        // Flush all changes
        decisionRuleRepository.flush();
        
        // Rebuild rules for fact type (only once for all rules)
        if (factType != null && successful > 0) {
            try {
                ruleEngineManager.rebuildRules(factType.getValue());
            } catch (Exception ex) {
                log.error("Failed to rebuild rules for fact type {}: {}", factType, ex.getMessage(), ex);
                // Continue even if rebuild fails - rules are already saved
            }
        }
        
        BatchCreateRulesResponse response = BatchCreateRulesResponse.builder()
            .success(failed == 0)
            .total(request.getRules().size())
            .successful(successful)
            .failed(failed)
            .results(results)
            .build();
        
        return ResponseEntity.ok(response);
    }

    @PostMapping
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<?> createRule(@RequestBody CreateRuleRequest request) {
        try {
            // Build DecisionRule from request DTO
            DecisionRule rule = buildRuleFromRequest(request);
            
            // Check for duplicate rule name (only check latest versions)
            if (rule.getRuleName() != null) {
                Optional<DecisionRule> existingRule = decisionRuleRepository.findByRuleNameAndIsLatestTrue(rule.getRuleName());
                if (existingRule.isPresent()) {
                    ErrorResponse errorResponse = ErrorResponse.builder()
                        .success(false)
                        .error("Rule name already exists: " + rule.getRuleName())
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
                    int totalConditions = (request.getConditions().getAndConditions() != null ? request.getConditions().getAndConditions().size() : 0) +
                                         (request.getConditions().getOrConditions() != null ? request.getConditions().getOrConditions().size() : 0);
                    log.info("Successfully saved {} conditions for rule {}", 
                        totalConditions, saved.getId());
                } catch (Exception ex) {
                    log.error("Failed to persist structured conditions for rule {}: {}", saved.getRuleName(), ex.getMessage(), ex);
                    ErrorResponse errorResponse = ErrorResponse.builder()
                        .success(false)
                        .error("Failed to save rule conditions: " + ex.getMessage())
                        .errorType(ex.getClass().getSimpleName())
                        .build();
                    return ResponseEntity.badRequest().body(errorResponse);
                }
            }
            
            // Parse and save outputs if provided
            if (request.getOutput() != null) {
                try {
                    saveRuleOutputs(saved, request.getOutput());
                    outputRepository.flush(); // Ensure outputs are persisted
                } catch (Exception ex) {
                    log.warn("Failed to persist rule outputs for rule {}: {}", saved.getRuleName(), ex.getMessage());
                    // Output errors are non-critical, but we should still log them
                }
            }
            
            // Flush all changes before reloading
            decisionRuleRepository.flush();
            
            // Rebuild rules for this fact type
            FactType factType = saved.getFactType() != null ? saved.getFactType() : FactType.DECLARATION;
            try {
                ruleEngineManager.rebuildRules(factType.getValue());
            } catch (Exception ex) {
                log.error("Failed to rebuild rules for fact type {}: {}", factType, ex.getMessage(), ex);
                // Continue even if rebuild fails - rule is already saved
            }
            
            // Reload rule from database to ensure all associations are loaded
            saved = decisionRuleRepository.findById(saved.getId()).orElse(saved);
            
            // Build response using DTO
            RuleResponse response = buildRuleResponse(saved, request);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error creating rule", e);
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error(e.getMessage() != null ? e.getMessage() : "Failed to create rule: " + e.getClass().getSimpleName())
                .errorType(e.getClass().getSimpleName())
                .build();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
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
                int totalConditions = (request.getConditions().getAndConditions() != null ? request.getConditions().getAndConditions().size() : 0) +
                                     (request.getConditions().getOrConditions() != null ? request.getConditions().getOrConditions().size() : 0);
                log.info("Successfully saved {} conditions for rule {}", 
                    totalConditions, saved.getId());
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
                .deployedBy(userDisplayNameService.getDisplayName(version.getCreatedBy()));
            
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
                        .deployedBy(userDisplayNameService.getDisplayName(v.getCreatedBy()));
                
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
        java.util.Set<FactType> defaultFactTypes = new java.util.HashSet<>(java.util.Arrays.asList(FactType.DECLARATION, FactType.CARGO_REPORT, FactType.TRAVELER));
        
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
        java.util.Set<FactType> defaultFactTypes = new java.util.HashSet<>(java.util.Arrays.asList(FactType.DECLARATION, FactType.CARGO_REPORT, FactType.TRAVELER));
        
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
     * Build entity from map data using Jackson ObjectMapper (generic method)
     * This automatically maps all fields from Map to the appropriate entity class
     * Unknown properties (like factType) are automatically ignored
     */
    private Object buildEntityFromMap(Map<String, Object> data, FactType factType) {
        try {
            // Get the main entity class for this fact type
            Class<?> entityClass = entityScannerService.getMainEntityClass(factType);
            if (entityClass == null) {
                throw new IllegalArgumentException("No entity class found for FactType: " + factType);
            }
            
            // Pre-process data: convert array fields to JSON strings and normalize field names for Traveler entity
            if (factType == FactType.TRAVELER) {
                Map<String, Object> processedData = new java.util.HashMap<>();
                
                // Normalize field names: convert "ID" to "Id" (camelCase) and handle arrays
                for (Map.Entry<String, Object> entry : data.entrySet()) {
                    String key = entry.getKey();
                    Object value = entry.getValue();
                    
                    // Normalize field names ending with "ID" to "Id" for camelCase compatibility
                    if (key.endsWith("ID") && key.length() > 2) {
                        key = key.substring(0, key.length() - 2) + "Id";
                    }
                    
                    // Convert array fields to JSON strings
                    if (value instanceof java.util.List) {
                        if (key.equals("otherGivenNames") || key.equals("baggageTagIds")) {
                            try {
                                com.fasterxml.jackson.databind.ObjectMapper tempMapper = new com.fasterxml.jackson.databind.ObjectMapper();
                                String jsonString = tempMapper.writeValueAsString(value);
                                processedData.put(key, jsonString);
                            } catch (Exception e) {
                                log.warn("Failed to convert {} to JSON string: {}", key, e.getMessage());
                                processedData.put(key, "[]");
                            }
                        } else {
                            // For other arrays (like itineraryLegs), keep as is for Jackson to handle
                            processedData.put(key, value);
                        }
                    } else {
                        processedData.put(key, value);
                    }
                }
                
                data = processedData;
            }
            
            // Use Jackson ObjectMapper to automatically convert Map to entity
            // Configure to ignore unknown properties (like factType which is not a field of entity)
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
            // Support Java 8 date/time (LocalDate, LocalDateTime)
            mapper.registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule());
            mapper.configure(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false);
            
            Object entity = mapper.convertValue(data, entityClass);
            
            return entity;
        } catch (Exception e) {
            log.error("Error converting Map to entity for FactType {}: {}", factType, e.getMessage(), e);
            throw new IllegalArgumentException("Invalid entity data for " + factType + ": " + e.getMessage(), e);
        }
    }
    
    /**
     * Extract identifier from entity based on fact type
     * Uses reflection to get the appropriate ID field (declarationId, reportId, travelerId, etc.)
     */
    private String extractEntityIdentifier(Object entity, FactType factType) {
        try {
            // Try common identifier field names based on fact type
            String[] identifierFieldNames = getIdentifierFieldNames(factType);
            
            for (String fieldName : identifierFieldNames) {
                try {
                    Field field = entity.getClass().getDeclaredField(fieldName);
                    field.setAccessible(true);
                    Object value = field.get(entity);
                    if (value != null) {
                        return value.toString();
                    }
                } catch (NoSuchFieldException e) {
                    // Try next field name
                    continue;
                }
            }
            
            // Fallback: generate identifier from fact type and hash
            String fallbackId = factType.getValue() + "-" + System.currentTimeMillis();
            log.warn("Could not extract identifier from entity {}, using fallback: {}", factType, fallbackId);
            return fallbackId;
        } catch (Exception e) {
            log.error("Error extracting identifier from entity: {}", e.getMessage(), e);
            throw new IllegalArgumentException("Could not extract identifier from entity: " + e.getMessage(), e);
        }
    }
    
    /**
     * Get identifier field names for a fact type
     */
    private String[] getIdentifierFieldNames(FactType factType) {
        switch (factType) {
            case DECLARATION:
                return new String[]{"declarationId"};
            case CARGO_REPORT:
                return new String[]{"reportId"};
            case TRAVELER:
                return new String[]{"travelerId", "sequenceNumeric"};
            default:
                return new String[]{"id"};
        }
    }
    
    /**
     * Build Declaration entity from map data using Jackson ObjectMapper
     * This automatically maps all fields from Map to Declaration entity
     * Unknown properties (like factType) are automatically ignored
     * @deprecated Use buildEntityFromMap instead
     */
    @Deprecated
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
     * Save execution results for all active rules with source tracking
     * Matches rules to hits by checking if rule name appears in hit result messages
     */
    @org.springframework.transaction.annotation.Transactional
    private void saveExecutionResults(
            String declarationId,
            FactType factType,
            rule.engine.org.app.domain.entity.execution.TotalRuleResults results,
            String executionSource) {
        try {
            // Get all active and latest rules for this fact type
            List<DecisionRule> activeRules = decisionRuleRepository
                .findByFactTypeAndIsLatestTrueAndStatusOrderByPriorityAsc(factType, RuleStatus.ACTIVE);
            
            if (activeRules.isEmpty()) {
                log.debug("No active rules found for fact type {}, skipping execution result saving", factType);
                return;
            }
            
            // Create a map of rule names to rules for quick lookup
            Map<String, DecisionRule> ruleMap = activeRules.stream()
                .collect(Collectors.toMap(DecisionRule::getRuleName, rule -> rule, (existing, replacement) -> existing));
            
            // Create a set of rule IDs that produced hits
            // First try to match by rule ID in description (more reliable)
            // Fallback to matching by rule name in result message (for backward compatibility)
            java.util.Set<Long> matchedRuleIds = new java.util.HashSet<>();
            java.util.Set<String> matchedRuleNames = new java.util.HashSet<>();
            
            if (results.getHits() != null) {
                for (rule.engine.org.app.domain.entity.execution.RuleOutputHit hit : results.getHits()) {
                    // First, try to match by rule ID in description (format: "RULE_ID:123")
                    if (hit.getDescription() != null && hit.getDescription().contains("RULE_ID:")) {
                        try {
                            String desc = hit.getDescription();
                            int startIdx = desc.indexOf("RULE_ID:") + 8;
                            int endIdx = desc.indexOf(" ", startIdx);
                            if (endIdx == -1) endIdx = desc.length();
                            String ruleIdStr = desc.substring(startIdx, endIdx).trim();
                            Long ruleId = Long.parseLong(ruleIdStr);
                            matchedRuleIds.add(ruleId);
                            continue; // Found by ID, skip name matching
                        } catch (Exception e) {
                            log.debug("Failed to parse rule ID from description: {}", hit.getDescription(), e);
                        }
                    }
                    
                    // Fallback: match by rule name in result message (for backward compatibility)
                    if (hit.getResult() != null) {
                        for (String ruleName : ruleMap.keySet()) {
                            if (hit.getResult().contains(ruleName)) {
                                matchedRuleNames.add(ruleName);
                                break; // Found a match, no need to check other rules
                            }
                        }
                    }
                }
            }
            
            // Save execution results ONLY for rules that hit (matched = true)
            // This saves storage and focuses on actual rule matches
            java.time.LocalDateTime executedAt = results.getRunAt() != null 
                ? results.getRunAt() 
                : java.time.LocalDateTime.now();
            
            int savedCount = 0;
            
            // Save results for rules matched by ID
            for (Long ruleId : matchedRuleIds) {
                DecisionRule rule = decisionRuleRepository.findById(ruleId).orElse(null);
                if (rule == null || !rule.getFactType().equals(factType) || !rule.getIsLatest() || rule.getStatus() != RuleStatus.ACTIVE) {
                    continue; // Skip if rule not found or not active
                }
                
                // Find the corresponding hit for this rule by ID
                rule.engine.org.app.domain.entity.execution.RuleOutputHit matchingHit = null;
                if (results.getHits() != null) {
                    for (rule.engine.org.app.domain.entity.execution.RuleOutputHit hit : results.getHits()) {
                        if (hit.getDescription() != null && hit.getDescription().contains("RULE_ID:" + ruleId)) {
                            matchingHit = hit;
                            break;
                        }
                    }
                }
                
                RuleExecutionResult executionResult = new RuleExecutionResult();
                executionResult.setDeclarationId(declarationId);
                executionResult.setDecisionRule(rule);
                executionResult.setMatched(true);
                executionResult.setExecutedAt(executedAt);
                executionResult.setExecutionSource(executionSource);
                
                if (matchingHit != null) {
                    executionResult.setRuleAction(matchingHit.getAction());
                    executionResult.setRuleResult(matchingHit.getResult());
                    executionResult.setRuleScore(matchingHit.getScore());
                } else {
                    executionResult.setRuleAction("FLAG");
                    executionResult.setRuleResult("Rule '" + rule.getRuleName() + "' matched");
                }
                
                executionResultRepository.save(executionResult);
                savedCount++;
            }
            
            // Save results for rules matched by name (backward compatibility)
            for (String matchedRuleName : matchedRuleNames) {
                DecisionRule rule = ruleMap.get(matchedRuleName);
                if (rule == null) {
                    continue; // Skip if rule not found
                }
                
                // Skip if already saved by ID
                if (matchedRuleIds.contains(rule.getId())) {
                    continue;
                }
                
                // Find the corresponding hit for this rule to get action, result, and score
                rule.engine.org.app.domain.entity.execution.RuleOutputHit matchingHit = null;
                if (results.getHits() != null) {
                    for (rule.engine.org.app.domain.entity.execution.RuleOutputHit hit : results.getHits()) {
                        if (hit.getResult() != null && hit.getResult().contains(rule.getRuleName())) {
                            matchingHit = hit;
                            break;
                        }
                    }
                }
                
                RuleExecutionResult executionResult = new RuleExecutionResult();
                executionResult.setDeclarationId(declarationId);
                executionResult.setDecisionRule(rule);
                executionResult.setMatched(true); // Only save matched rules
                executionResult.setExecutedAt(executedAt);
                executionResult.setExecutionSource(executionSource);
                
                if (matchingHit != null) {
                    executionResult.setRuleAction(matchingHit.getAction());
                    executionResult.setRuleResult(matchingHit.getResult());
                    executionResult.setRuleScore(matchingHit.getScore());
                } else {
                    // Rule matched but no specific hit found, use defaults
                    executionResult.setRuleAction("FLAG");
                    executionResult.setRuleResult("Rule '" + rule.getRuleName() + "' matched");
                }
                
                executionResultRepository.save(executionResult);
                savedCount++;
            }
            
            log.debug("Saved execution results for {} rules that hit (out of {} total active rules) with source {}", 
                savedCount, activeRules.size(), executionSource);
        } catch (Exception e) {
            log.error("Error saving execution results for declaration {}", declarationId, e);
            // Don't throw exception - execution results saving should not fail the request
        }
    }
    
    /**
     * Get all execution history (for current user's rules)
     * Supports filtering by execution source and pagination
     */
    @GetMapping("/executions")
    public ResponseEntity<List<RuleExecutionResponse>> getAllExecutions(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam(required = false) String source,
            @RequestParam(required = false, defaultValue = "100") Integer limit) {
        // Debug logging - try to get user from SecurityContext as fallback
        org.springframework.security.core.Authentication auth = 
            org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        
        log.debug("getAllExecutions called - currentUser: {}, auth: {}, source: {}, limit: {}", 
            currentUser != null ? currentUser.getId() : "null",
            auth != null ? auth.getName() : "null",
            source, limit);
        
        // Try to get UserPrincipal from SecurityContext if @AuthenticationPrincipal is null
        if (currentUser == null && auth != null && auth.getPrincipal() instanceof UserPrincipal) {
            currentUser = (UserPrincipal) auth.getPrincipal();
            log.debug("Retrieved UserPrincipal from SecurityContext: {}", currentUser.getId());
        }
        
        if (currentUser == null) {
            log.warn("getAllExecutions: currentUser is null - authentication may have failed. Auth object: {}", auth);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication is required to access this resource.");
        }
        
        String userId = requireUserId(currentUser);
        
        // Query execution results for user's rules with optional source filter
        List<RuleExecutionResult> results = executionResultRepository
            .findByUserRulesAndSource(userId, source);
        
        // Apply limit and convert to response
        List<RuleExecutionResponse> responses = results.stream()
            .limit(limit != null ? limit : 100)
            .map(this::toExecutionResponse)
            .collect(Collectors.toList());
        
        log.debug("getAllExecutions returning {} results for user {}", responses.size(), userId);
        return ResponseEntity.ok(responses);
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
    public ResponseEntity<List<RuleResponse>> getRuleVersions(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        String userId = requireUserId(currentUser);
        if (decisionRuleRepository.findByIdAndCreatedBy(id, userId).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        try {
            List<RuleResponse> versions = ruleVersionService.getVersionHistory(id).stream()
                    .filter(rule -> userId.equals(rule.getCreatedBy()))
                    .map(rule -> buildVersionResponse(rule))
                    .collect(Collectors.toList());
            return ResponseEntity.ok(versions);
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }
    
    /**
     * Build a simplified RuleResponse for version history (without loading full conditions/output)
     */
    private RuleResponse buildVersionResponse(DecisionRule rule) {
        return RuleResponse.builder()
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
            .createdBy(userDisplayNameService.getDisplayName(rule.getCreatedBy()))
            .updatedBy(userDisplayNameService.getDisplayName(rule.getUpdatedBy()))
            .build();
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
            result.getExecutedAt(),
            result.getExecutionSource() != null ? result.getExecutionSource() : "API"  // Default to API if not set
        );
    }

    private String requireUserId(UserPrincipal currentUser) {
        if (currentUser == null || currentUser.getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User context is missing");
        }
        return currentUser.getId().toString();
    }

    private boolean isAdministrator(UserPrincipal currentUser) {
        if (currentUser == null || currentUser.getRoles() == null) {
            return false;
        }
        return currentUser.getRoles().contains(UserRole.RULE_ADMINISTRATOR);
    }

    private void enforceRuleOwnership(Long ruleId, UserPrincipal currentUser) {
        if (isAdministrator(currentUser)) {
            return;
        }
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
        
        ConditionsGroup conditionsGroup = null;
        Map<String, Object> output = null;
        
        if (request instanceof CreateRuleRequest) {
            conditionsGroup = ((CreateRuleRequest) request).getConditions();
            output = ((CreateRuleRequest) request).getOutput();
        } else if (request instanceof UpdateRuleRequest) {
            conditionsGroup = ((UpdateRuleRequest) request).getConditions();
            output = ((UpdateRuleRequest) request).getOutput();
        }
        
        String whenClause = buildWhenClauseFromConditionsGroup(conditionsGroup, factType.getValue());
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
     * Build WHEN clause from conditions group
     */
    private String buildWhenClauseFromConditionsGroup(ConditionsGroup conditionsGroup, String factType) {
        if (conditionsGroup == null || conditionsGroup.isEmpty()) {
            return null;
        }
        return generateWhenExprFromConditionsGroup(conditionsGroup, factType);
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
        // Always add rule ID to description for tracking which rule fired
        // Format: "RULE_ID:123" to allow matching in saveExecutionResults
        String ruleIdMarker = "RULE_ID:" + rule.getId();
        if (output.get("description") != null) {
            // Append rule ID marker to existing description
            String descriptionWithMarker = output.get("description").toString() + " | " + ruleIdMarker;
            then.append("    output.setDescription(\"").append(escapeJavaString(descriptionWithMarker)).append("\");\n");
        } else {
            // Set description to rule ID marker only
            then.append("    output.setDescription(\"").append(ruleIdMarker).append("\");\n");
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
    
    /**
     * Generate WHEN expression from conditions group
     * Handles AND and OR groups separately
     */
    private String generateWhenExprFromConditionsGroup(ConditionsGroup conditionsGroup, String factType) {
        // Convert to flat list for processing
        List<Map<String, Object>> conditions = conditionsGroup.toFlatList();
        return generateWhenExprFromConditions(conditions, factType);
    }
    
    /**
     * Generate WHEN expression from flat conditions list
     * @deprecated Use generateWhenExprFromConditionsGroup instead
     */
    @Deprecated
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
        } else if (factTypeEnum == FactType.TRAVELER) {
            factVariable = "$t";
            factClassName = "Traveler";
        } else {
            factVariable = "$d";
            factClassName = "Declaration";
        }

        // Separate regular conditions from collection conditions
        // Group collection conditions by collection path to handle multiple fields in same collection
        List<ConditionWithOperator> regularConditions = new ArrayList<>();
        Map<String, List<CollectionConditionInfo>> collectionConditionsByPath = new java.util.HashMap<>();
        
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
            
            // Get logical operator (AND/OR) - default to AND for first condition
            String logicalOp = i > 0 ? (String) condition.getOrDefault("logicalOp", "AND") : "AND";
            boolean isOr = "OR".equalsIgnoreCase(logicalOp);

            String fieldType = fieldTypeByName.getOrDefault(field, "string");
            String valueExpression = buildValueExpression(valueObj, fieldType);

            if (valueExpression == null) {
                continue;
            }

            // Check if field path contains a collection
            CollectionFieldInfo collectionInfo = extractCollectionInfo(field, factTypeEnum);
            if (collectionInfo != null) {
                // Collection condition - group by collection path
                String collectionKey = collectionInfo.getCollectionPath();
                collectionConditionsByPath.computeIfAbsent(collectionKey, k -> new ArrayList<>())
                    .add(new CollectionConditionInfo(collectionInfo, operator, valueExpression, isOr));
            } else {
                // Regular condition - goes inside fact pattern
                String droolsFieldPath = normalizeFieldPath(field, factVariable);
                String conditionStr = droolsFieldPath + " " + operator + " " + valueExpression;
                regularConditions.add(new ConditionWithOperator(conditionStr, isOr));
            }
        }
        
        // Build collection conditions - group multiple fields in same collection
        List<ConditionWithOperator> collectionConditions = buildGroupedCollectionConditions(
            collectionConditionsByPath, factTypeEnum);

        // Build WHEN clause
        StringBuilder whenClause = new StringBuilder();
        
        // Fact pattern with regular conditions
        if (regularConditions.isEmpty() && collectionConditions.isEmpty()) {
            return null;
        }
        
        if (regularConditions.isEmpty()) {
            whenClause.append(factVariable).append(" : ").append(factClassName).append("()");
        } else {
            // Join regular conditions - use comma for AND, || for OR
            String regularConditionStr = joinPatternConditions(regularConditions);
            whenClause.append(factVariable).append(" : ").append(factClassName).append("(").append(regularConditionStr).append(")");
        }
        
        // Add collection conditions after fact pattern
        if (!collectionConditions.isEmpty()) {
            whenClause.append("\n    ");
            whenClause.append(joinConditionsWithOperators(collectionConditions));
        }
        
        return whenClause.toString();
    }
    
    /**
     * Helper class to store condition with its logical operator
     */
    private static class ConditionWithOperator
    {
        final String condition;
        final boolean isOr;
        
        ConditionWithOperator(String condition, boolean isOr)
        {
            this.condition = condition;
            this.isOr = isOr;
        }
    }
    
    /**
     * Normalize field path to use proper fact variable prefix
     * Handles fields that start with "declaration.", "cargoReport.", "traveler." or have no prefix
     */
    private String normalizeFieldPath(String field, String factVariable)
    {
        if (field.startsWith("declaration."))
        {
            return "$d." + field.substring("declaration.".length());
        }
        else if (field.startsWith("cargoReport."))
        {
            return "$c." + field.substring("cargoReport.".length());
        }
        else if (field.startsWith("traveler."))
        {
            return "$t." + field.substring("traveler.".length());
        }
        else if (field.contains("."))
        {
            // Field path with dots but no prefix - assume it's a nested field
            // Add fact variable prefix
            return factVariable + "." + field;
        }
        else
        {
            // Simple field name - add fact variable prefix
            return factVariable + "." + field;
        }
    }
    
    /**
     * Join conditions for pattern matching - use comma for AND, || for OR
     * In Drools pattern matching, comma (,) is preferred over && for AND
     */
    private String joinPatternConditions(List<ConditionWithOperator> conditions)
    {
        if (conditions.isEmpty())
        {
            return "";
        }
        
        StringBuilder result = new StringBuilder();
        result.append(conditions.get(0).condition);
        
        for (int i = 1; i < conditions.size(); i++)
        {
            ConditionWithOperator cond = conditions.get(i);
            // Use comma for AND (standard Drools pattern syntax), || for OR
            String operator = cond.isOr ? " || " : ", ";
            result.append(operator).append(cond.condition);
        }
        
        return result.toString();
    }
    
    /**
     * Join conditions with explicit logical operators (&&/||) - used for collection conditions outside pattern
     */
    private String joinConditionsWithOperators(List<ConditionWithOperator> conditions)
    {
        if (conditions.isEmpty())
        {
            return "";
        }
        
        StringBuilder result = new StringBuilder();
        result.append(conditions.get(0).condition);
        
        for (int i = 1; i < conditions.size(); i++)
        {
            ConditionWithOperator cond = conditions.get(i);
            String operator = cond.isOr ? " || " : " && ";
            result.append(operator).append(cond.condition);
        }
        
        return result.toString();
        }
        
    
    /**
     * Helper class to store collection field information
     */
    private static class CollectionFieldInfo
    {
        final String collectionPath; // e.g., "declaration.governmentAgencyGoodsItems"
        final String collectionFieldName; // e.g., "governmentAgencyGoodsItems"
        final String relatedFieldName; // e.g., "quantityUnitCode"
        final Class<?> relatedEntityClass;
        final String factVariable;
        final boolean isNested;
        final String firstCollectionName; // for nested
        final String secondCollectionName; // for nested
        
        CollectionFieldInfo(String collectionPath, String collectionFieldName, String relatedFieldName,
                           Class<?> relatedEntityClass, String factVariable)
        {
            this.collectionPath = collectionPath;
            this.collectionFieldName = collectionFieldName;
            this.relatedFieldName = relatedFieldName;
            this.relatedEntityClass = relatedEntityClass;
            this.factVariable = factVariable;
            this.isNested = false;
            this.firstCollectionName = null;
            this.secondCollectionName = null;
        }
        
        CollectionFieldInfo(String collectionPath, String firstCollectionName, String secondCollectionName,
                           String relatedFieldName, Class<?> relatedEntityClass, String factVariable)
        {
            this.collectionPath = collectionPath;
            this.collectionFieldName = secondCollectionName;
            this.relatedFieldName = relatedFieldName;
            this.relatedEntityClass = relatedEntityClass;
            this.factVariable = factVariable;
            this.isNested = true;
            this.firstCollectionName = firstCollectionName;
            this.secondCollectionName = secondCollectionName;
        }
        
        String getCollectionPath()
        {
            return collectionPath;
        }
        
        String getEntityClassName()
        {
            return relatedEntityClass.getSimpleName();
        }
    }
    
    /**
     * Helper class to store collection condition information
     */
    private static class CollectionConditionInfo
    {
        final CollectionFieldInfo fieldInfo;
        final String operator;
        final String valueExpression;
        final boolean isOr;
        
        CollectionConditionInfo(CollectionFieldInfo fieldInfo, String operator, String valueExpression, boolean isOr)
        {
            this.fieldInfo = fieldInfo;
            this.operator = operator;
            this.valueExpression = valueExpression;
            this.isOr = isOr;
        }
    }
    
    /**
     * Extract collection information from field path
     * Returns null if not a collection field
     */
    private CollectionFieldInfo extractCollectionInfo(String fieldPath, FactType factType)
    {
        String[] parts = fieldPath.split("\\.");
        String factVariable = (factType == FactType.CARGO_REPORT) ? "$c" : "$d";
        Class<?> entityClass = entityScannerService.getMainEntityClass(factType);
        
        if (entityClass == null)
        {
            return null;
        }
        
        // Case 1: Single level collection (entity.collection.field) - 3 parts
        if (parts.length == 3)
        {
            String collectionFieldName = parts[1];
            String relatedFieldName = parts[2];
            
            try
            {
            Field collectionField = entityClass.getDeclaredField(collectionFieldName);
            jakarta.persistence.OneToMany oneToMany = collectionField.getAnnotation(jakarta.persistence.OneToMany.class);
                if (oneToMany == null)
                {
                    return null;
            }
            
            Type genericType = collectionField.getGenericType();
                if (genericType instanceof ParameterizedType)
                {
                ParameterizedType paramType = (ParameterizedType) genericType;
                Type[] actualTypes = paramType.getActualTypeArguments();
                    if (actualTypes.length > 0 && actualTypes[0] instanceof Class)
                    {
                    Class<?> relatedEntityClass = (Class<?>) actualTypes[0];
                        String collectionPath = factVariable + "." + collectionFieldName;
                        return new CollectionFieldInfo(collectionPath, collectionFieldName, relatedFieldName,
                            relatedEntityClass, factVariable);
                }
            }
            }
            catch (NoSuchFieldException e)
            {
            log.debug("Field {} not found in entity class {}", collectionFieldName, entityClass.getSimpleName());
            return null;
        }
    }
    
        // Case 2: Nested collection (entity.collection1.collection2.field) - 4 parts
        if (parts.length == 4)
        {
            String firstCollectionName = parts[1];
            String secondCollectionName = parts[2];
            String finalFieldName = parts[3];
            
            try
            {
            Field firstCollectionField = entityClass.getDeclaredField(firstCollectionName);
            jakarta.persistence.OneToMany firstOneToMany = firstCollectionField.getAnnotation(jakarta.persistence.OneToMany.class);
                if (firstOneToMany == null)
                {
                return null;
            }
            
            Type firstGenericType = firstCollectionField.getGenericType();
                if (!(firstGenericType instanceof ParameterizedType))
                {
                return null;
            }
            
            ParameterizedType firstParamType = (ParameterizedType) firstGenericType;
            Type[] firstActualTypes = firstParamType.getActualTypeArguments();
                if (firstActualTypes.length == 0 || !(firstActualTypes[0] instanceof Class))
                {
                return null;
            }
            
            Class<?> firstRelatedEntityClass = (Class<?>) firstActualTypes[0];
            Field secondCollectionField = firstRelatedEntityClass.getDeclaredField(secondCollectionName);
            jakarta.persistence.OneToMany secondOneToMany = secondCollectionField.getAnnotation(jakarta.persistence.OneToMany.class);
                if (secondOneToMany == null)
                {
                return null;
            }
            
            Type secondGenericType = secondCollectionField.getGenericType();
                if (!(secondGenericType instanceof ParameterizedType))
                {
                return null;
            }
            
            ParameterizedType secondParamType = (ParameterizedType) secondGenericType;
            Type[] secondActualTypes = secondParamType.getActualTypeArguments();
                if (secondActualTypes.length == 0 || !(secondActualTypes[0] instanceof Class))
                {
                return null;
            }
            
            Class<?> secondRelatedEntityClass = (Class<?>) secondActualTypes[0];
                String collectionPath = factVariable + "." + firstCollectionName + "." + secondCollectionName;
                return new CollectionFieldInfo(collectionPath, firstCollectionName, secondCollectionName,
                    finalFieldName, secondRelatedEntityClass, factVariable);
            }
            catch (NoSuchFieldException e)
            {
            log.debug("Nested collection field not found: {} -> {}", firstCollectionName, secondCollectionName);
            return null;
        }
    }
        
        return null;
    }
    
    /**
     * Build grouped collection conditions
     * Groups multiple fields in same collection into one pattern (for AND)
     * Or creates separate patterns (for OR)
     */
    private List<ConditionWithOperator> buildGroupedCollectionConditions(
        Map<String, List<CollectionConditionInfo>> collectionConditionsByPath, FactType factType)
    {
        List<ConditionWithOperator> result = new ArrayList<>();
        
        for (Map.Entry<String, List<CollectionConditionInfo>> entry : collectionConditionsByPath.entrySet())
        {
            String collectionPath = entry.getKey();
            List<CollectionConditionInfo> conditions = entry.getValue();
            
            if (conditions.isEmpty())
            {
                continue;
            }
            
            // Get first condition to determine structure
            CollectionConditionInfo firstCondition = conditions.get(0);
            CollectionFieldInfo fieldInfo = firstCondition.fieldInfo;
            String entityClassName = fieldInfo.getEntityClassName();
            
            // In the same collection pattern, all conditions must have the same logicalOp
            // The logicalOp of the second condition (or later) indicates the operator between conditions
            // If there's only one condition, default to AND
            final boolean useOr;
            if (conditions.size() > 1)
            {
                // Use logicalOp from the second condition (which indicates operator between first and second)
                boolean secondIsOr = conditions.get(1).isOr;
                
                // Verify all non-first conditions have the same logicalOp
                boolean allSameOp = conditions.stream()
                    .skip(1) // Skip first condition
                    .allMatch(c -> c.isOr == secondIsOr);
                if (!allSameOp)
                {
                    log.warn("Mixed AND/OR in same collection pattern - using logicalOp from second condition");
                }
                
                useOr = secondIsOr;
            }
            else
            {
                useOr = false; // Default to AND for single condition
            }
            
            // Build pattern with all conditions for this collection
            // Use comma (,) for AND, || for OR within the pattern
            StringBuilder pattern = new StringBuilder();
            pattern.append("(");
            pattern.append("item : ").append(entityClassName).append("(");
            
            // Add all conditions with the same separator (all AND or all OR)
            String separator = useOr ? " || " : ", ";
            
            for (int i = 0; i < conditions.size(); i++)
            {
                CollectionConditionInfo condInfo = conditions.get(i);
                String conditionStr = condInfo.fieldInfo.relatedFieldName + " " + 
                    condInfo.operator + " " + condInfo.valueExpression;
                
                if (i > 0)
                {
                    pattern.append(separator);
                }
                pattern.append(conditionStr);
            }
            
            pattern.append(") from ").append(collectionPath);
            pattern.append(")");
            
            result.add(new ConditionWithOperator(pattern.toString(), useOr));
        }
        
        return result;
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
     * Parse and save rule conditions from ConditionsGroup
     * Handles single condition (null) and multiple conditions (AND/OR groups)
     */
    @org.springframework.transaction.annotation.Transactional
    private void saveRuleConditions(DecisionRule rule, ConditionsGroup conditionsGroup) {
        // Delete existing conditions first
        List<RuleConditionGroup> existingGroups = conditionGroupRepository.findByDecisionRuleIdOrderByOrderIndexAsc(rule.getId());
        for (RuleConditionGroup group : existingGroups) {
            conditionRepository.deleteAll(conditionRepository.findByGroupOrderByOrderIndexAsc(group));
        }
        conditionGroupRepository.deleteAll(existingGroups);
        
        if (conditionsGroup == null || conditionsGroup.isEmpty()) {
            return;
        }
        
        // Count total conditions
        int andCount = (conditionsGroup.getAndConditions() != null) ? conditionsGroup.getAndConditions().size() : 0;
        int orCount = (conditionsGroup.getOrConditions() != null) ? conditionsGroup.getOrConditions().size() : 0;
        int totalCount = andCount + orCount;
        
        // If only 1 condition total, handle nested structure
        // With nested structure, the item is a nested group object, not a direct condition
        if (totalCount == 1) {
            Object singleItem = null;
            RuleGroupType groupType = RuleGroupType.AND;
            if (andCount == 1) {
                singleItem = conditionsGroup.getAndConditions().get(0);
                groupType = RuleGroupType.AND;
            } else if (orCount == 1) {
                singleItem = conditionsGroup.getOrConditions().get(0);
                groupType = RuleGroupType.OR;
            }
            
            if (singleItem instanceof Map) {
                Map<String, Object> itemMap = (Map<String, Object>) singleItem;
                // Check if this is a nested group (has "AND" or "OR" key)
                if (itemMap.containsKey("AND") || itemMap.containsKey("OR")) {
                    List<Map<String, Object>> nestedConditions = null;
                    RuleGroupType nestedType = groupType;
                    if (itemMap.containsKey("AND")) {
                        nestedConditions = (List<Map<String, Object>>) itemMap.get("AND");
                        nestedType = RuleGroupType.AND;
                    } else if (itemMap.containsKey("OR")) {
                        nestedConditions = (List<Map<String, Object>>) itemMap.get("OR");
                        nestedType = RuleGroupType.OR;
                    }
                    
                    if (nestedConditions != null && !nestedConditions.isEmpty()) {
                        // Create a group for the nested conditions
                        RuleConditionGroup group = new RuleConditionGroup();
                        group.setDecisionRule(rule);
                        group.setType(nestedType);
                        group.setOrderIndex(0);
                        group = conditionGroupRepository.save(group);
                        
                        int conditionOrderIndex = 0;
                        for (Object nestedItem : nestedConditions) {
                            if (nestedItem instanceof Map) {
                                Map<String, Object> nestedCond = (Map<String, Object>) nestedItem;
                                if (nestedCond.containsKey("field") && nestedCond.containsKey("operator") && nestedCond.containsKey("value")) {
                                    RuleCondition condition = parseConditionFromMap(nestedCond, group, conditionOrderIndex++);
                                    conditionRepository.save(condition);
                                }
                            }
                        }
                    }
                } else if (itemMap.containsKey("field") && itemMap.containsKey("operator") && itemMap.containsKey("value")) {
                    // Direct condition (backward compatibility)
                    RuleConditionGroup group = new RuleConditionGroup();
                    group.setDecisionRule(rule);
                    group.setType(groupType);
                    group.setOrderIndex(0);
                    group = conditionGroupRepository.save(group);
                    
                    RuleCondition condition = parseConditionFromMap(itemMap, group, 0);
                    conditionRepository.save(condition);
                }
            }
            return;
        }
        
        // Multiple conditions: save with proper AND/OR groups
                int groupOrderIndex = 0;
        
        // Save AND conditions (only if 2+ conditions)
        if (conditionsGroup.getAndConditions() != null && conditionsGroup.getAndConditions().size() > 1) {
            RuleConditionGroup andGroup = new RuleConditionGroup();
            andGroup.setDecisionRule(rule);
            andGroup.setType(RuleGroupType.AND);
            andGroup.setOrderIndex(groupOrderIndex++);
            andGroup = conditionGroupRepository.save(andGroup);
                
                int conditionOrderIndex = 0;
            for (Object item : conditionsGroup.getAndConditions()) {
                if (item instanceof Map) {
                    Map<String, Object> mapItem = (Map<String, Object>) item;
                    // Check if this is a nested ConditionsGroup (has "AND" or "OR" key)
                    if (mapItem.containsKey("AND") || mapItem.containsKey("OR")) {
                        // Save nested group as a separate group (will be reconstructed as nested)
                        List<Map<String, Object>> nestedConditions = null;
                        RuleGroupType nestedType = null;
                        if (mapItem.containsKey("AND")) {
                            nestedConditions = (List<Map<String, Object>>) mapItem.get("AND");
                            nestedType = RuleGroupType.AND;
                        } else if (mapItem.containsKey("OR")) {
                            nestedConditions = (List<Map<String, Object>>) mapItem.get("OR");
                            nestedType = RuleGroupType.OR;
                        }
                        if (nestedConditions != null && nestedConditions.size() > 0) {
                            // Create a nested group (will be reconstructed as nested structure)
                            RuleConditionGroup nestedGroup = new RuleConditionGroup();
                            nestedGroup.setDecisionRule(rule);
                            nestedGroup.setType(nestedType);
                            nestedGroup.setOrderIndex(groupOrderIndex++);
                            nestedGroup = conditionGroupRepository.save(nestedGroup);
                            
                            int nestedConditionOrderIndex = 0;
                            for (Object nestedItem : nestedConditions) {
                                if (nestedItem instanceof Map) {
                                    Map<String, Object> nestedCond = (Map<String, Object>) nestedItem;
                                    if (nestedCond.containsKey("field") && nestedCond.containsKey("operator") && nestedCond.containsKey("value")) {
                                        RuleCondition condition = parseConditionFromMap(nestedCond, nestedGroup, nestedConditionOrderIndex++);
                                        conditionRepository.save(condition);
                                    }
                                }
                            }
                        }
                    } else {
                        // Regular condition
                        if (!mapItem.containsKey("field") || !mapItem.containsKey("operator") || !mapItem.containsKey("value")) {
                        continue;
                    }
                        RuleCondition condition = parseConditionFromMap(mapItem, andGroup, conditionOrderIndex++);
                        conditionRepository.save(condition);
                    }
                }
            }
        }
        
        // Save OR conditions (only if 2+ conditions)
        if (conditionsGroup.getOrConditions() != null && conditionsGroup.getOrConditions().size() > 1) {
            RuleConditionGroup orGroup = new RuleConditionGroup();
            orGroup.setDecisionRule(rule);
            orGroup.setType(RuleGroupType.OR);
            orGroup.setOrderIndex(groupOrderIndex++);
            orGroup = conditionGroupRepository.save(orGroup);
            
            int conditionOrderIndex = 0;
            for (Object item : conditionsGroup.getOrConditions()) {
                if (item instanceof Map) {
                    Map<String, Object> mapItem = (Map<String, Object>) item;
                    // Check if this is a nested ConditionsGroup (has "AND" or "OR" key)
                    if (mapItem.containsKey("AND") || mapItem.containsKey("OR")) {
                        // Save nested group as a separate group (will be reconstructed as nested)
                        List<Map<String, Object>> nestedConditions = null;
                        RuleGroupType nestedType = null;
                        if (mapItem.containsKey("AND")) {
                            nestedConditions = (List<Map<String, Object>>) mapItem.get("AND");
                            nestedType = RuleGroupType.AND;
                        } else if (mapItem.containsKey("OR")) {
                            nestedConditions = (List<Map<String, Object>>) mapItem.get("OR");
                            nestedType = RuleGroupType.OR;
                        }
                        if (nestedConditions != null && nestedConditions.size() > 0) {
                            // Create a nested group (will be reconstructed as nested structure)
                            RuleConditionGroup nestedGroup = new RuleConditionGroup();
                            nestedGroup.setDecisionRule(rule);
                            nestedGroup.setType(nestedType);
                            nestedGroup.setOrderIndex(groupOrderIndex++);
                            nestedGroup = conditionGroupRepository.save(nestedGroup);
                            
                            int nestedConditionOrderIndex = 0;
                            for (Object nestedItem : nestedConditions) {
                                if (nestedItem instanceof Map) {
                                    Map<String, Object> nestedCond = (Map<String, Object>) nestedItem;
                                    if (nestedCond.containsKey("field") && nestedCond.containsKey("operator") && nestedCond.containsKey("value")) {
                                        RuleCondition condition = parseConditionFromMap(nestedCond, nestedGroup, nestedConditionOrderIndex++);
                    conditionRepository.save(condition);
                                    }
                                }
                            }
                        }
                    } else {
                        // Regular condition
                        if (!mapItem.containsKey("field") || !mapItem.containsKey("operator") || !mapItem.containsKey("value")) {
                            continue;
                        }
                        RuleCondition condition = parseConditionFromMap(mapItem, orGroup, conditionOrderIndex++);
                        conditionRepository.save(condition);
                    }
                }
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
            .createdBy(userDisplayNameService.getDisplayName(rule.getCreatedBy()))
            .updatedBy(userDisplayNameService.getDisplayName(rule.getUpdatedBy()));
        
        // Extract fields from request DTO if provided
        String description = null;
        ConditionsGroup conditionsGroup = null;
        Map<String, Object> output = null;
        
        if (request instanceof CreateRuleRequest) {
            CreateRuleRequest createRequest = (CreateRuleRequest) request;
            description = createRequest.getDescription();
            conditionsGroup = createRequest.getConditions();
            output = createRequest.getOutput();
        } else if (request instanceof UpdateRuleRequest) {
            UpdateRuleRequest updateRequest = (UpdateRuleRequest) request;
            description = updateRequest.getDescription();
            conditionsGroup = updateRequest.getConditions();
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
        if (conditionsGroup != null) {
            responseBuilder.conditions(conditionsGroup);
        } else {
            // Reconstruct conditions from saved RuleCondition entities
            ConditionsGroup reconstructedConditions = reconstructConditionsFromRule(rule);
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
     * Extract object path from field path
     * Example: "declaration.invoiceAmount" -> "declaration"
     * Example: "declaration.governmentAgencyGoodsItems.netWeightMeasure" -> "declaration.governmentAgencyGoodsItems"
     */
    private String getObjectPath(String fieldPath) {
        if (fieldPath == null || fieldPath.isEmpty()) {
            return "";
        }
        String[] parts = fieldPath.split("\\.");
        if (parts.length <= 1) {
            return fieldPath;
        }
        // Return all parts except the last one (the actual field name)
        return String.join(".", java.util.Arrays.copyOf(parts, parts.length - 1));
    }
    
    /**
     * Reconstruct ConditionsGroup from saved RuleCondition entities
     * Groups conditions by object path to create nested structure
     * Returns null if only 1 condition (no AND/OR groups needed)
     */
    private ConditionsGroup reconstructConditionsFromRule(DecisionRule rule) {
        List<Map<String, Object>> topLevelAndConditions = new java.util.ArrayList<>();
        List<Map<String, Object>> topLevelOrConditions = new java.util.ArrayList<>();
        
        try {
            // Use decisionRuleId instead of DecisionRule object to avoid object reference issues
            List<RuleConditionGroup> groups = conditionGroupRepository.findByDecisionRuleIdOrderByOrderIndexAsc(rule.getId());
            log.debug("Found {} condition groups for rule {}", groups.size(), rule.getId());
            
            // Group conditions by object path within each group
            // Each group represents a nested structure
            for (RuleConditionGroup group : groups) {
                List<RuleCondition> groupConditions = conditionRepository.findByGroupOrderByOrderIndexAsc(group);
                log.debug("Found {} conditions in group {} for rule {}", groupConditions.size(), group.getId(), rule.getId());
                
                if (groupConditions.isEmpty()) {
                    continue;
                }
                
                // Group conditions by object path within this group
                Map<String, List<Map<String, Object>>> conditionsByObjectPath = new java.util.HashMap<>();
                
                for (RuleCondition cond : groupConditions) {
                    String objectPath = getObjectPath(cond.getFieldPath());
                    conditionsByObjectPath.computeIfAbsent(objectPath, k -> new java.util.ArrayList<>());
                    
                    // Build condition map
                    Map<String, Object> conditionMap = new java.util.HashMap<>();
                    conditionMap.put("field", cond.getFieldPath());
                    conditionMap.put("operator", mapOperatorToString(cond.getOperator()));
                    conditionMap.put("value", extractValueFromCondition(cond));
                    conditionsByObjectPath.get(objectPath).add(conditionMap);
                }
                
                // Build nested structure for this group
                if (conditionsByObjectPath.size() > 1) {
                    // Multiple object paths: create nested groups
                    for (Map.Entry<String, List<Map<String, Object>>> entry : conditionsByObjectPath.entrySet()) {
                        List<Map<String, Object>> conditions = entry.getValue();
                        
                        if (conditions.size() > 1) {
                            // Create nested group
                            Map<String, Object> nestedGroup = new java.util.HashMap<>();
                            nestedGroup.put("AND", conditions);
                            
                            List<Map<String, Object>> targetList = (group.getType() == RuleGroupType.OR) ? topLevelOrConditions : topLevelAndConditions;
                            targetList.add(nestedGroup);
                        } else if (conditions.size() == 1) {
                            // Single condition: wrap in nested group
                            Map<String, Object> nestedGroup = new java.util.HashMap<>();
                            nestedGroup.put("AND", conditions);
                            
                            List<Map<String, Object>> targetList = (group.getType() == RuleGroupType.OR) ? topLevelOrConditions : topLevelAndConditions;
                            targetList.add(nestedGroup);
                        }
                    }
                } else if (conditionsByObjectPath.size() == 1) {
                    // Single object path: flat structure or nested if group type matches
                    Map.Entry<String, List<Map<String, Object>>> entry = conditionsByObjectPath.entrySet().iterator().next();
                    List<Map<String, Object>> conditions = entry.getValue();
                    
                    if (conditions.size() > 1) {
                        // Multiple conditions: create nested group
                        Map<String, Object> nestedGroup = new java.util.HashMap<>();
                        nestedGroup.put(group.getType() == RuleGroupType.OR ? "OR" : "AND", conditions);
                        
                        List<Map<String, Object>> targetList = (group.getType() == RuleGroupType.OR) ? topLevelOrConditions : topLevelAndConditions;
                        targetList.add(nestedGroup);
                    } else if (conditions.size() == 1) {
                        // Single condition: wrap in nested group to match AI-generated structure
                        Map<String, Object> nestedGroup = new java.util.HashMap<>();
                        nestedGroup.put(group.getType() == RuleGroupType.OR ? "OR" : "AND", conditions);
                        
                        List<Map<String, Object>> targetList = (group.getType() == RuleGroupType.OR) ? topLevelOrConditions : topLevelAndConditions;
                        targetList.add(nestedGroup);
                    }
                }
            }
        } catch (Exception ex) {
            log.error("Error reconstructing conditions for rule {}: {}", rule.getId(), ex.getMessage(), ex);
        }
        
        int totalCount = topLevelAndConditions.size() + topLevelOrConditions.size();
        
        // If only 1 condition total, return ConditionsGroup with AND array containing 1 item
        // This matches the structure that AI generates (single condition in AND array)
        if (totalCount == 1) {
            if (topLevelAndConditions.size() == 1) {
                // Single AND condition: wrap in AND array
                List<Map<String, Object>> singleAndList = new java.util.ArrayList<>();
                singleAndList.add(topLevelAndConditions.get(0));
                return ConditionsGroup.builder()
                    .andConditions(singleAndList)
                    .orConditions(null)
                    .build();
            } else if (topLevelOrConditions.size() == 1) {
                // Single OR condition: wrap in OR array
                List<Map<String, Object>> singleOrList = new java.util.ArrayList<>();
                singleOrList.add(topLevelOrConditions.get(0));
                return ConditionsGroup.builder()
                    .andConditions(null)
                    .orConditions(singleOrList)
                    .build();
            }
            return null;
        }
        
        // Multiple conditions: return with AND/OR groups (only include if 2+ conditions)
        return ConditionsGroup.builder()
            .andConditions((topLevelAndConditions.size() > 1) ? topLevelAndConditions : null)
            .orConditions((topLevelOrConditions.size() > 1) ? topLevelOrConditions : null)
            .build();
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
