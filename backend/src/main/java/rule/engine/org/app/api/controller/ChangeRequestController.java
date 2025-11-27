package rule.engine.org.app.api.controller;

import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import com.fasterxml.jackson.core.JsonProcessingException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import rule.engine.org.app.api.request.ApproveChangeRequestRequest;
import rule.engine.org.app.api.request.RejectChangeRequestRequest;
import rule.engine.org.app.api.response.CreateChangeRequestResponse;
import rule.engine.org.app.api.response.ApproveChangeRequestResponse;
import rule.engine.org.app.api.response.RejectChangeRequestResponse;
import rule.engine.org.app.api.response.ChangeRequestResponse;
import rule.engine.org.app.api.response.ErrorResponse;
import rule.engine.org.app.domain.entity.ui.ChangeRequest;
import rule.engine.org.app.domain.entity.ui.ChangeRequestStatus;
import rule.engine.org.app.domain.entity.ui.FactType;
import rule.engine.org.app.domain.entity.ui.DecisionRule;
import rule.engine.org.app.domain.entity.ui.KieContainerVersion;
import rule.engine.org.app.domain.entity.ui.RuleStatus;
import rule.engine.org.app.domain.repository.ChangeRequestRepository;
import rule.engine.org.app.domain.repository.DecisionRuleRepository;
import rule.engine.org.app.domain.repository.KieContainerVersionRepository;
import rule.engine.org.app.domain.service.RuleEngineManager;
import rule.engine.org.app.domain.entity.security.UserRole;
import rule.engine.org.app.domain.service.DeploymentSchedulerService;
import rule.engine.org.app.domain.service.UserDisplayNameService;
import rule.engine.org.app.security.UserPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/change-requests")
public class ChangeRequestController {
    
    /**
     * DTO for change request changes JSON structure
     * Simplified to Include/Exclude model for clarity
     */
    @Data
    @NoArgsConstructor
    private static class ChangeRequestChanges {
        private List<Long> rulesToInclude = new ArrayList<>();  // Rules to activate
        private List<Long> rulesToExclude = new ArrayList<>();  // Rules to deactivate
        
        // Deprecated fields for backward compatibility
        @Deprecated
        private List<Long> rulesToAdd = new ArrayList<>();
        @Deprecated
        private List<Long> rulesToUpdate = new ArrayList<>();
        @Deprecated
        private List<Long> rulesToDelete = new ArrayList<>();
    }
    
    /**
     * DTO for create change request request body
     * Changes are auto-detected by comparing with deployed version
     */
    @Data
    @NoArgsConstructor
    private static class CreateChangeRequestRequest {
        private FactType factType = FactType.DECLARATION;
        private String title;
        private String description;
        // Note: changes field removed - auto-detected by backend
    }
    
    /**
     * DTO for validate change request request body
     */
    @Data
    @NoArgsConstructor
    private static class ValidateChangeRequestRequest {
        private FactType factType = FactType.DECLARATION;
    }
    
    /**
     * DTO for validation response
     */
    @Data
    @Builder
    private static class ChangeRequestValidationResponse {
        private boolean success;
        private String message;
        private String factType;
        private int compiledRuleCount;
        private int totalChanges;
        private int rulesToInclude;
        private int rulesToExclude;
        private String releaseId;
        private String error;
    }

    private static final Logger log = LoggerFactory.getLogger(ChangeRequestController.class);

    private final ChangeRequestRepository changeRequestRepository;
    private final DecisionRuleRepository decisionRuleRepository;
    private final KieContainerVersionRepository containerVersionRepository;
    private final RuleEngineManager ruleEngineManager;
    private final ObjectMapper objectMapper;
    private final rule.engine.org.app.domain.repository.ScheduledDeploymentRepository scheduledDeploymentRepository;
    private final DeploymentSchedulerService deploymentSchedulerService;
    private final UserDisplayNameService userDisplayNameService;

    public ChangeRequestController(
            ChangeRequestRepository changeRequestRepository,
            DecisionRuleRepository decisionRuleRepository,
            KieContainerVersionRepository containerVersionRepository,
            RuleEngineManager ruleEngineManager,
            ObjectMapper objectMapper,
            rule.engine.org.app.domain.repository.ScheduledDeploymentRepository scheduledDeploymentRepository,
            DeploymentSchedulerService deploymentSchedulerService,
            UserDisplayNameService userDisplayNameService) {
        this.changeRequestRepository = changeRequestRepository;
        this.decisionRuleRepository = decisionRuleRepository;
        this.containerVersionRepository = containerVersionRepository;
        this.ruleEngineManager = ruleEngineManager;
        this.objectMapper = objectMapper;
        this.scheduledDeploymentRepository = scheduledDeploymentRepository;
        this.deploymentSchedulerService = deploymentSchedulerService;
        this.userDisplayNameService = userDisplayNameService;
    }
    
    /**
     * Helper method to convert list of numbers to List<Long>
     * Handles Integer, Long, and other Number types from JSON deserialization
     */
    private List<Long> convertToLongList(Object obj) {
        if (obj == null) return List.of();
        if (obj instanceof List) {
            return ((List<?>) obj).stream()
                    .map(item -> {
                        if (item instanceof Long) return (Long) item;
                        if (item instanceof Integer) return ((Integer) item).longValue();
                        if (item instanceof Number) return ((Number) item).longValue();
                        return Long.parseLong(item.toString());
                    })
                    .collect(java.util.stream.Collectors.toList());
        }
        return List.of();
    }

    /**
     * Get all change requests, optionally filtered by fact type and status
     * Administrators see all change requests, regular users only see their own
     */
    @GetMapping
    public ResponseEntity<List<ChangeRequestResponse>> getAllChangeRequests(
            @RequestParam(required = false) String factType,
            @RequestParam(required = false) String status,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        try {
            String userId = requireUserId(currentUser);
            List<ChangeRequest> requests;
            FactType factTypeEnum = factType != null && !factType.isEmpty() 
                ? FactType.fromValue(factType) : null;
            ChangeRequestStatus statusEnum = status != null && !status.isEmpty() 
                ? ChangeRequestStatus.fromValue(status) : null;
            
            if (isAdministrator(currentUser)) {
                // Administrators see all change requests
                requests = changeRequestRepository.findAllChangeRequests(factTypeEnum, statusEnum);
            } else {
                // Regular users only see their own change requests
                requests = changeRequestRepository.findOwnedChangeRequests(factTypeEnum, statusEnum, userId);
            }
            List<ChangeRequestResponse> responses = requests.stream()
                .map(this::buildChangeRequestResponse)
                .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(responses);
        } catch (Exception e) {
            log.error("Failed to fetch change requests", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Get a specific change request by ID
     * Administrators can view any change request, regular users can only view their own
     */
    @GetMapping("/{id}")
    public ResponseEntity<ChangeRequestResponse> getChangeRequest(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        try {
            String userId = requireUserId(currentUser);
            Optional<ChangeRequest> request;
            if (isAdministrator(currentUser)) {
                // Administrators can view any change request
                request = changeRequestRepository.findById(id);
            } else {
                // Regular users can only view their own change requests
                request = changeRequestRepository.findByIdAndCreatedBy(id, userId);
            }
            return request.map(this::buildChangeRequestResponse)
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            log.error("Failed to fetch change request {}", id, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Preview changes before creating a change request
     * Returns detected changes without saving
     * Only detects changes for rules created by the current user
     */
    @GetMapping("/preview-changes")
    public ResponseEntity<?> previewChanges(
            @RequestParam(required = false) String factType,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        try {
            String userId = requireUserId(currentUser);
            FactType ft = factType != null && !factType.isEmpty() 
                ? FactType.fromValue(factType) 
                : FactType.DECLARATION;
            
            ChangeRequestChanges changes = detectChanges(ft, userId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("factType", ft);
            response.put("changes", changes);
            response.put("totalChanges", changes.getRulesToInclude().size() + changes.getRulesToExclude().size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to preview changes", e);
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "error", e.getMessage()
            ));
        }
    }
    
    /**
     * Create a new change request
     * Automatically detects changes compared to the last deployed version
     * Only detects changes for rules created by the current user
     */
    @PostMapping
    public ResponseEntity<?> createChangeRequest(
            @RequestBody CreateChangeRequestRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        try {
            String userId = requireUserId(currentUser);
            FactType factType = request.getFactType() != null ? request.getFactType() : FactType.DECLARATION;

            ValidationContext validationContext = performValidation(factType, userId);
            if (!validationContext.response().isSuccess()) {
                ErrorResponse errorResponse = ErrorResponse.builder()
                        .success(false)
                        .error(validationContext.response().getMessage())
                        .errorType("ValidationException")
                        .build();
                return ResponseEntity.badRequest().body(errorResponse);
            }

            ChangeRequest changeRequest = new ChangeRequest();
            changeRequest.setFactType(factType);
            changeRequest.setTitle(request.getTitle());
            changeRequest.setDescription(request.getDescription());
            changeRequest.setStatus(ChangeRequestStatus.PENDING);

            String changesJson = objectMapper.writeValueAsString(validationContext.changes());
            changeRequest.setChangesJson(changesJson);

            applyValidationMetadata(changeRequest, validationContext);

            ChangeRequest saved = changeRequestRepository.save(changeRequest);

            CreateChangeRequestResponse response = CreateChangeRequestResponse.builder()
                .success(true)
                .id(saved.getId())
                .message("Change request created successfully with " + 
                    validationContext.response().getTotalChanges() + 
                    " detected changes (validation passed)")
                .build();

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to create change request", e);
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error(e.getMessage())
                .errorType(e.getClass().getName())
                .build();
            return ResponseEntity.badRequest().body(errorResponse);
        }
    }
    
    /**
     * Validate detected changes by compiling the would-be deployed rules without
     * persisting a new package version.
     */
    @PostMapping("/validate")
    public ResponseEntity<?> validateChangeRequest(
            @RequestBody(required = false) ValidateChangeRequestRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        try {
            String userId = requireUserId(currentUser);
            FactType factType = request != null && request.getFactType() != null
                    ? request.getFactType()
                    : FactType.DECLARATION;

            ValidationContext validationContext = performValidation(factType, userId);
            return ResponseEntity.ok(validationContext.response());
        } catch (Exception e) {
            log.error("Failed to validate change request", e);
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error(e.getMessage())
                .errorType(e.getClass().getName())
                .build();
            return ResponseEntity.badRequest().body(errorResponse);
        }
    }
    
    /**
     * Detect changes compared to last deployed version
     * Returns rules that will be included (activated) or excluded (deactivated)
     * Only detects changes for rules created by the specified user
     * 
     * Logic:
     * - Compare LATEST rules (both active AND draft) created by user with deployed version
     * - Rules to Include: New draft rules + Modified rules (new versions) created by user
     * - Rules to Exclude: Previously deployed rules created by user that are now removed/replaced
     */
    private ChangeRequestChanges detectChanges(FactType factType, String userId) {
        ChangeRequestChanges changes = new ChangeRequestChanges();
        
        // Get latest deployed version
        Optional<KieContainerVersion> deployedVersion = containerVersionRepository
            .findTopByFactTypeOrderByVersionDesc(factType);
        
        // Get current latest rules created by this user (active + draft)
        // Draft rules are new rules that need to be activated through change request
        List<DecisionRule> allLatestRules = decisionRuleRepository
            .findByFactTypeAndIsLatestTrue(factType);
        
        // Filter to only include rules created by this user
        List<DecisionRule> currentLatestRules = allLatestRules.stream()
            .filter(rule -> userId.equals(rule.getCreatedBy()))
            .collect(Collectors.toList());
        
        Set<Long> currentLatestRuleIds = currentLatestRules.stream()
            .map(DecisionRule::getId)
            .collect(Collectors.toSet());
        
        if (deployedVersion.isEmpty()) {
            // First deployment
            // Include all draft rules created by this user (need to be activated)
            changes.setRulesToInclude(new ArrayList<>(currentLatestRuleIds));
            return changes;
        }
        
        // Parse deployed rule IDs
        String deployedRuleIds = deployedVersion.get().getRuleIds();
        Set<Long> deployedRuleIdsSet = new HashSet<>();
        if (deployedRuleIds != null && !deployedRuleIds.isEmpty()) {
            deployedRuleIdsSet = Arrays.stream(deployedRuleIds.split(","))
                .filter(s -> !s.isEmpty())
                .map(Long::parseLong)
                .collect(Collectors.toSet());
        }
        
        // Filter deployed rules to only include those created by this user
        Set<Long> userDeployedRuleIds = new HashSet<>();
        if (!deployedRuleIdsSet.isEmpty()) {
            List<DecisionRule> deployedRules = decisionRuleRepository.findAllById(deployedRuleIdsSet);
            userDeployedRuleIds = deployedRules.stream()
                .filter(rule -> userId.equals(rule.getCreatedBy()))
                .map(DecisionRule::getId)
                .collect(Collectors.toSet());
        }
        
        // Detect changes:
        // 1. Rules to Include: 
        //    a) New draft rules created by user (NOT in deployed version)
        //    b) Modified rules (new version with different ID than deployed) created by user
        List<Long> rulesToInclude = new ArrayList<>();
        for (Long ruleId : currentLatestRuleIds) {
            if (!userDeployedRuleIds.contains(ruleId)) {
                rulesToInclude.add(ruleId);
            }
        }
        
        // 2. Rules to Exclude: Deployed rules created by user that are NO LONGER in latest set
        //    (Deactivated or replaced by new version)
        List<Long> rulesToExclude = new ArrayList<>();
        for (Long deployedRuleId : userDeployedRuleIds) {
            if (!currentLatestRuleIds.contains(deployedRuleId)) {
                rulesToExclude.add(deployedRuleId);
            }
        }
        
        changes.setRulesToInclude(rulesToInclude);
        changes.setRulesToExclude(rulesToExclude);
        
        return changes;
    }
    
    /**
     * Build a simulated ruleset representing the post-approval state without mutating DB entities.
     * Rules to include are treated as ACTIVE for validation purposes (simulating post-approval state).
     */
    private List<DecisionRule> buildRulesetForValidation(FactType factType, ChangeRequestChanges changes) {
        Map<Long, DecisionRule> simulatedRules = new LinkedHashMap<>();
        
        // Start with currently deployed (active + latest) rules
        List<DecisionRule> activeRules = decisionRuleRepository
            .findByFactTypeAndIsLatestTrueAndStatusOrderByPriorityAsc(factType, RuleStatus.ACTIVE);
        activeRules.forEach(rule -> simulatedRules.put(rule.getId(), rule));
        
        // Remove rules that will be excluded
        if (changes.getRulesToExclude() != null && !changes.getRulesToExclude().isEmpty()) {
            changes.getRulesToExclude().forEach(simulatedRules::remove);
        }
        
        // Add rules that will be included (typically drafts/new versions)
        // IMPORTANT: These rules will be activated when change request is approved,
        // so we simulate them as ACTIVE for validation
        if (changes.getRulesToInclude() != null && !changes.getRulesToInclude().isEmpty()) {
            Iterable<DecisionRule> includeRules = decisionRuleRepository.findAllById(changes.getRulesToInclude());
            for (DecisionRule rule : includeRules) {
                if (rule == null) {
                    log.warn("Rule to include is null, skipping");
                    continue;
                }
                
                // For validation, we need to ensure rules to include are treated as ACTIVE
                // Create a copy with ACTIVE status to simulate post-approval state
                // Note: We only modify status, keeping all other fields from original rule
                DecisionRule simulatedRule = new DecisionRule();
                simulatedRule.setId(rule.getId());
                simulatedRule.setRuleName(rule.getRuleName());
                simulatedRule.setLabel(rule.getLabel());
                simulatedRule.setFactType(rule.getFactType());
                simulatedRule.setRuleContent(rule.getRuleContent()); // This is what matters for Drools execution
                simulatedRule.setPriority(rule.getPriority());
                simulatedRule.setStatus(RuleStatus.ACTIVE); // Simulate as ACTIVE for validation
                simulatedRule.setIsLatest(rule.getIsLatest());
                simulatedRule.setVersion(rule.getVersion());
                simulatedRule.setParentRuleId(rule.getParentRuleId());
                
                log.info("➕ Adding rule to include: ID={}, Name={}, Status={}, HasContent={}", 
                        rule.getId(), rule.getRuleName(), rule.getStatus(), 
                        rule.getRuleContent() != null && !rule.getRuleContent().isEmpty());
                
                // IMPORTANT: Use put to override if rule already exists (rules to include take precedence)
                simulatedRules.put(rule.getId(), simulatedRule);
            }
        }
        
        // Sort by priority to match deployment behavior
        List<DecisionRule> result = new ArrayList<>(simulatedRules.values());
        result.sort((r1, r2) -> {
            int p1 = r1.getPriority() != null ? r1.getPriority() : 0;
            int p2 = r2.getPriority() != null ? r2.getPriority() : 0;
            return Integer.compare(p1, p2);
        });
        
        log.info("✅ Final simulated ruleset: {} rules total", result.size());
        for (DecisionRule r : result) {
            log.info("  📌 Rule ID={}, Name={}, Status={}, Priority={}", 
                    r.getId(), r.getRuleName(), r.getStatus(), r.getPriority());
        }
        
        return result;
    }

    private ValidationContext performValidation(FactType factType, String userId) throws JsonProcessingException {
        ChangeRequestChanges detectedChanges = detectChanges(factType, userId);
        List<DecisionRule> simulatedRules = buildRulesetForValidation(factType, detectedChanges);

        log.info("🔍 Building validation container with {} rules (factType: {})", 
                simulatedRules.size(), factType.getValue());
        log.info("📋 Rules to include: {}, Rules to exclude: {}", 
                detectedChanges.getRulesToInclude().size(), 
                detectedChanges.getRulesToExclude().size());

        Map<String, Object> validationResult = ruleEngineManager
                .validateRulesBuild(factType.getValue(), simulatedRules);

        boolean success = Boolean.TRUE.equals(validationResult.get("success"));
        String message = (String) validationResult.getOrDefault("message",
                success ? "Validation completed successfully" : "Validation failed");
        String releaseId = validationResult.containsKey("releaseId")
                ? validationResult.get("releaseId").toString()
                : null;
        String error = validationResult.containsKey("error")
                ? validationResult.get("error").toString()
                : null;

        // If build succeeded, try execution test with sample data
        Map<String, Object> executionTestResult = null;
        org.kie.api.runtime.KieContainer tempContainer = null;
        try {
            if (success && factType == FactType.DECLARATION) {
                // Get container from validation result - this is the temporary container just built
                Object containerObj = validationResult.get("container");
                if (containerObj instanceof org.kie.api.runtime.KieContainer) {
                    tempContainer = (org.kie.api.runtime.KieContainer) containerObj;
                    log.info("🧪 Using temporary container for execution test (ReleaseId: {})", 
                            validationResult.get("releaseId"));
                    executionTestResult = performExecutionTest(tempContainer, factType.getValue());
                } else {
                    log.warn("⚠️ Container not found in validation result or wrong type: {}", 
                            containerObj != null ? containerObj.getClass().getName() : "null");
                    executionTestResult = Map.of(
                            "status", "SKIPPED",
                            "message", "Container not available for execution test"
                    );
                }
            }
        } catch (Exception e) {
            log.warn("Execution test failed during validation: {}", e.getMessage(), e);
            executionTestResult = Map.of(
                    "status", "FAILED",
                    "message", "Execution test failed: " + e.getMessage()
            );
        } finally {
            // Cleanup temporary container - this is the container from the temporary build
            if (tempContainer != null) {
                try {
                    log.debug("Disposing temporary validation container");
                    tempContainer.dispose();
                } catch (Exception e) {
                    log.warn("Error disposing temporary container: {}", e.getMessage());
                }
            }
        }

        ChangeRequestValidationResponse response = ChangeRequestValidationResponse.builder()
                .success(success)
                .message(message)
                .factType(factType.getValue())
                .compiledRuleCount(simulatedRules.size())
                .totalChanges(detectedChanges.getRulesToInclude().size()
                        + detectedChanges.getRulesToExclude().size())
                .rulesToInclude(detectedChanges.getRulesToInclude().size())
                .rulesToExclude(detectedChanges.getRulesToExclude().size())
                .releaseId(releaseId)
                .error(error)
                .build();

        String serializedResponse = objectMapper.writeValueAsString(response);

        return new ValidationContext(detectedChanges, response, serializedResponse, Instant.now(), executionTestResult);
    }

    /**
     * Perform execution test with sample declaration data
     */
    private Map<String, Object> performExecutionTest(org.kie.api.runtime.KieContainer container, String factType) {
        try {
            // Load sample declaration data
            Map<String, Object> sampleData = loadSampleDeclarationData();
            if (sampleData == null || sampleData.isEmpty()) {
                return Map.of(
                        "status", "SKIPPED",
                        "message", "No sample data available for execution test"
                );
            }

            // Convert to Declaration entity
            rule.engine.org.app.domain.entity.execution.declaration.Declaration declaration = 
                    buildDeclarationFromMap(sampleData);
            
            // Log declaration details
            if (declaration != null) {
                log.info("📋 Declaration built: ID={}, OfficeID={}, InvoiceAmount={}, PackageQuantity={}, TotalGrossMassMeasure={}", 
                        declaration.getId(),
                        declaration.getOfficeId(),
                        declaration.getInvoiceAmount(),
                        declaration.getPackageQuantity(),
                        declaration.getTotalGrossMassMeasure());
                if (declaration.getGovernmentAgencyGoodsItems() != null) {
                    log.info("📦 Goods items count: {}", declaration.getGovernmentAgencyGoodsItems().size());
                    declaration.getGovernmentAgencyGoodsItems().forEach(item -> {
                        log.info("  - HSID={}, QuantityQuantity={}, UnitPriceAmount={}, OriginCountryID={}, DutyRate={}", 
                                item.getHsId(), item.getQuantityQuantity(), item.getUnitPriceAmount(), 
                                item.getOriginCountryId(), item.getDutyRate());
                    });
                } else {
                    log.warn("⚠️ GovernmentAgencyGoodsItems is null!");
                }
            } else {
                log.warn("⚠️ Declaration is null after building from sample data!");
            }

            // Execute with temporary container
            log.info("🚀 Executing rules with temporary container (factType: {})", factType);
            rule.engine.org.app.domain.entity.execution.TotalRuleResults results = 
                    ruleEngineManager.executeWithTemporaryContainer(container, factType, declaration);

            int hitsCount = results.getHits() != null ? results.getHits().size() : 0;
            log.info("✅ Execution test completed: {} hits, totalScore: {}, finalAction: {}", 
                    hitsCount, results.getTotalScore(), results.getFinalAction());
            
            if (hitsCount == 0) {
                log.warn("⚠️ No rule hits detected in execution test! This may indicate rules are not matching the sample data.");
            }

            // Build execution test result
            Map<String, Object> executionResult = new HashMap<>();
            executionResult.put("status", "PASSED");
            executionResult.put("message", "Execution test completed successfully");
            executionResult.put("hitsCount", hitsCount);
            executionResult.put("totalScore", results.getTotalScore());
            executionResult.put("finalAction", results.getFinalAction());
            executionResult.put("finalFlag", results.getFinalFlag());
            executionResult.put("runAt", results.getRunAt());

            // Serialize hits for storage
            if (results.getHits() != null && !results.getHits().isEmpty()) {
                List<Map<String, Object>> hitsData = results.getHits().stream()
                        .map(hit -> {
                            Map<String, Object> hitMap = new HashMap<>();
                            hitMap.put("action", hit.getAction());
                            hitMap.put("score", hit.getScore());
                            hitMap.put("result", hit.getResult());
                            hitMap.put("flag", hit.getFlag());
                            hitMap.put("description", hit.getDescription());
                            return hitMap;
                        })
                        .collect(Collectors.toList());
                executionResult.put("hits", hitsData);
            }

            return executionResult;
        } catch (Exception e) {
            log.error("Error performing execution test", e);
            return Map.of(
                    "status", "FAILED",
                    "message", "Execution test failed: " + e.getMessage(),
                    "error", e.getClass().getName()
            );
        }
    }

    /**
     * Load sample declaration data for execution testing from JSON file
     */
    private Map<String, Object> loadSampleDeclarationData() {
        try {
            // Read from resources/goods-declaration-sample.json
            java.io.InputStream inputStream = getClass().getClassLoader()
                    .getResourceAsStream("goods-declaration-sample.json");
            
            if (inputStream == null) {
                log.error("Sample declaration data file not found: goods-declaration-sample.json");
                return null;
            }
            
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, Object> data = mapper.readValue(inputStream, 
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            
            inputStream.close();
            
            log.info("✅ Loaded sample declaration data from goods-declaration-sample.json");
            return data;
        } catch (Exception e) {
            log.error("Error loading sample declaration data from file", e);
            return null;
        }
    }

    /**
     * Convert Map to Declaration entity (similar to RuleController.buildDeclarationFromMap)
     */
    private rule.engine.org.app.domain.entity.execution.declaration.Declaration buildDeclarationFromMap(
            Map<String, Object> data) {
        try {
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

    private void applyValidationMetadata(ChangeRequest changeRequest, ValidationContext validationContext) {
        ChangeRequestValidationResponse validationResponse = validationContext.response();
        changeRequest.setValidationStatus(validationResponse.isSuccess() ? "SUCCESS" : "FAILED");
        changeRequest.setValidationMessage(validationResponse.getMessage());
        changeRequest.setValidationReleaseId(validationResponse.getReleaseId());
        changeRequest.setValidationRuleCount(validationResponse.getCompiledRuleCount());
        changeRequest.setValidationError(validationResponse.getError());
        changeRequest.setValidationResultJson(validationContext.serializedResponse());
        changeRequest.setValidationCheckedAt(validationContext.checkedAt());

        // Apply execution test results if available
        if (validationContext.executionTestResult() != null) {
            Map<String, Object> execResult = validationContext.executionTestResult();
            String status = (String) execResult.getOrDefault("status", "NOT_RUN");
            changeRequest.setExecutionTestStatus(status);
            changeRequest.setExecutionTestMessage((String) execResult.getOrDefault("message", ""));
            
            if (execResult.containsKey("hitsCount")) {
                changeRequest.setExecutionTestHitsCount((Integer) execResult.get("hitsCount"));
            }
            if (execResult.containsKey("totalScore")) {
                Object scoreObj = execResult.get("totalScore");
                if (scoreObj instanceof java.math.BigDecimal) {
                    changeRequest.setExecutionTestTotalScore((java.math.BigDecimal) scoreObj);
                } else if (scoreObj instanceof Number) {
                    changeRequest.setExecutionTestTotalScore(
                            java.math.BigDecimal.valueOf(((Number) scoreObj).doubleValue()));
                }
            }
            if (execResult.containsKey("finalAction")) {
                changeRequest.setExecutionTestFinalAction((String) execResult.get("finalAction"));
            }
            
            try {
                String execResultJson = objectMapper.writeValueAsString(execResult);
                changeRequest.setExecutionTestResultJson(execResultJson);
            } catch (JsonProcessingException e) {
                log.warn("Failed to serialize execution test result: {}", e.getMessage());
            }
        } else {
            changeRequest.setExecutionTestStatus("NOT_RUN");
        }
    }

    private record ValidationContext(
            ChangeRequestChanges changes,
            ChangeRequestValidationResponse response,
            String serializedResponse,
            Instant checkedAt,
            Map<String, Object> executionTestResult) {
        
        ValidationContext(ChangeRequestChanges changes,
                         ChangeRequestValidationResponse response,
                         String serializedResponse,
                         Instant checkedAt) {
            this(changes, response, serializedResponse, checkedAt, null);
        }
    }

    /**
     * Approve a change request
     * This will apply the changes and either deploy immediately or schedule deployment
     * IMPORTANT: Only rules with status=ACTIVE AND isLatest=true will be deployed
     * Only RULE_ADMINISTRATOR can approve change requests
     */
    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approveChangeRequest(
            @PathVariable Long id,
            @RequestBody(required = false) ApproveChangeRequestRequest requestBody,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        try {
            // Only administrators can approve change requests
            requireAdministrator(currentUser);
            
            Optional<ChangeRequest> requestOpt = changeRequestRepository.findById(id);
            if (requestOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            
            ChangeRequest request = requestOpt.get();
            if (request.getStatus() != ChangeRequestStatus.PENDING) {
                ErrorResponse errorResponse = ErrorResponse.builder()
                    .success(false)
                    .error("Change request is not in Pending status")
                    .errorType("ValidationException")
                    .build();
                return ResponseEntity.badRequest().body(errorResponse);
            }
            
            // Parse changes JSON to DTO
            ChangeRequestChanges changes;
            if (request.getChangesJson() != null && !request.getChangesJson().isEmpty()) {
                try {
                    changes = objectMapper.readValue(request.getChangesJson(), ChangeRequestChanges.class);
                } catch (Exception e) {
                    log.error("Failed to parse changes JSON: {}", e.getMessage(), e);
                    // Fallback: try to parse as Map and convert manually
                    @SuppressWarnings("unchecked")
                    Map<String, Object> changesMap = objectMapper.readValue(request.getChangesJson(), Map.class);
                    changes = new ChangeRequestChanges();
                    // Try new format first (Include/Exclude)
                    if (changesMap.containsKey("rulesToInclude") || changesMap.containsKey("rulesToExclude")) {
                        changes.setRulesToInclude(convertToLongList(changesMap.getOrDefault("rulesToInclude", List.of())));
                        changes.setRulesToExclude(convertToLongList(changesMap.getOrDefault("rulesToExclude", List.of())));
                    } else {
                        // Fallback to old format (Add/Update/Delete)
                        changes.setRulesToAdd(convertToLongList(changesMap.getOrDefault("rulesToAdd", List.of())));
                        changes.setRulesToUpdate(convertToLongList(changesMap.getOrDefault("rulesToUpdate", List.of())));
                        changes.setRulesToDelete(convertToLongList(changesMap.getOrDefault("rulesToDelete", List.of())));
                    }
                }
            } else {
                changes = new ChangeRequestChanges();
            }
            
            // IMPORTANT: Process rule state changes before deployment
            
            // 1. Activate draft rules (new rules or new versions)
            if (!changes.getRulesToInclude().isEmpty()) {
                changes.getRulesToInclude().forEach(ruleId -> 
                    decisionRuleRepository.findById(ruleId).ifPresent(rule -> {
                        if (rule.getStatus() != RuleStatus.ACTIVE) {
                            log.info("Activating rule #{} (version {}) - status: {} → ACTIVE", 
                                ruleId, rule.getVersion(), rule.getStatus());
                            rule.setStatus(RuleStatus.ACTIVE);
                            decisionRuleRepository.save(rule);
                        }
                    })
                );
            }
            
            // 2. Deactivate old versions (rules being replaced or removed)
            if (!changes.getRulesToExclude().isEmpty()) {
                changes.getRulesToExclude().forEach(ruleId -> 
                    decisionRuleRepository.findById(ruleId).ifPresent(rule -> {
                        if (rule.getStatus() == RuleStatus.ACTIVE) {
                            log.info("Deactivating rule #{} (version {}) - replaced by newer version or removed", 
                                ruleId, rule.getVersion());
                            rule.setStatus(RuleStatus.INACTIVE);
                            decisionRuleRepository.save(rule);
                        }
                    })
                );
            }
            
            // Update change request status
            String userId = requireUserId(currentUser);
            request.setStatus(ChangeRequestStatus.APPROVED);
            request.setApprovedBy(userId);
            request.setApprovedDate(Instant.now());
            changeRequestRepository.save(request);
            
            FactType factType = request.getFactType() != null ? request.getFactType() : FactType.DECLARATION;
            
            // Determine deployment option (default to IMMEDIATE for backward compatibility)
            ApproveChangeRequestRequest.DeploymentOption deploymentOption = 
                (requestBody != null && requestBody.getDeploymentOption() != null) 
                    ? requestBody.getDeploymentOption() 
                    : ApproveChangeRequestRequest.DeploymentOption.IMMEDIATE;
            
            String message;
            
            if (deploymentOption == ApproveChangeRequestRequest.DeploymentOption.SCHEDULED) {
                // Validate scheduled time
                if (requestBody == null || requestBody.getScheduledTime() == null) {
                    ErrorResponse errorResponse = ErrorResponse.builder()
                        .success(false)
                        .error("Scheduled time is required for SCHEDULED deployment")
                        .errorType("ValidationException")
                        .build();
                    return ResponseEntity.badRequest().body(errorResponse);
                }
                
                if (requestBody.getScheduledTime().isBefore(Instant.now())) {
                    ErrorResponse errorResponse = ErrorResponse.builder()
                        .success(false)
                        .error("Scheduled time must be in the future")
                        .errorType("ValidationException")
                        .build();
                    return ResponseEntity.badRequest().body(errorResponse);
                }
                
                // Create scheduled deployment
                rule.engine.org.app.domain.entity.ui.ScheduledDeployment scheduledDeployment = 
                    new rule.engine.org.app.domain.entity.ui.ScheduledDeployment();
                scheduledDeployment.setChangeRequestId(request.getId());
                scheduledDeployment.setFactType(factType);
                scheduledDeployment.setScheduledTime(requestBody.getScheduledTime());
                scheduledDeployment.setDeploymentNotes(requestBody.getDeploymentNotes());
                scheduledDeployment.setStatus(rule.engine.org.app.domain.entity.ui.ScheduledDeployment.DeploymentStatus.PENDING);
                scheduledDeploymentRepository.save(scheduledDeployment);
                
                message = String.format(
                    "Change request approved. Deployment scheduled for %s. Only active and latest rules will be deployed.",
                    requestBody.getScheduledTime()
                );
                
                log.info("Change request {} approved with scheduled deployment at {}", 
                    id, requestBody.getScheduledTime());
                
            } else {
                // IMMEDIATE deployment
                // Validate that there are active and latest rules to deploy
                List<rule.engine.org.app.domain.entity.ui.DecisionRule> rulesToDeploy = 
                    decisionRuleRepository.findByFactTypeAndStatusAndIsLatest(factType, RuleStatus.ACTIVE, true);
                
                if (rulesToDeploy.isEmpty()) {
                    log.warn("No active and latest rules found for fact type: {}. Skipping deployment.", 
                        factType.getValue());
                    message = "Change request approved but no active and latest rules to deploy";
                } else {
                    log.info("Deploying {} active and latest rules for fact type: {}", 
                        rulesToDeploy.size(), factType.getValue());
                    
                    // Deploy rules for the fact type (this will rebuild and increment version)
                    ruleEngineManager.deployRules(factType.getValue());
                    
                    message = String.format(
                        "Change request approved and %d active and latest rules deployed successfully",
                        rulesToDeploy.size()
                    );
                }
            }
            
            ApproveChangeRequestResponse response = ApproveChangeRequestResponse.builder()
                .success(true)
                .message(message)
                .build();
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to approve change request {}", id, e);
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error(e.getMessage())
                .errorType(e.getClass().getName())
                .build();
            return ResponseEntity.internalServerError().body(errorResponse);
        }
    }

    /**
     * Reject a change request
     * Only RULE_ADMINISTRATOR can reject change requests
     */
    @PostMapping("/{id}/reject")
    public ResponseEntity<?> rejectChangeRequest(
            @PathVariable Long id,
            @RequestBody RejectChangeRequestRequest requestBody,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        try {
            // Only administrators can reject change requests
            requireAdministrator(currentUser);
            
            Optional<ChangeRequest> requestOpt = changeRequestRepository.findById(id);
            if (requestOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            
            ChangeRequest request = requestOpt.get();
            if (request.getStatus() != ChangeRequestStatus.PENDING) {
                ErrorResponse errorResponse = ErrorResponse.builder()
                    .success(false)
                    .error("Change request is not in Pending status")
                    .errorType("ValidationException")
                    .build();
                return ResponseEntity.badRequest().body(errorResponse);
            }
            
            // Update change request status
            String userId = requireUserId(currentUser);
            request.setStatus(ChangeRequestStatus.REJECTED);
            request.setRejectedBy(userId);
            request.setRejectedDate(Instant.now());
            request.setRejectionReason(requestBody != null ? requestBody.getRejectionReason() : null);
            changeRequestRepository.save(request);
            
            RejectChangeRequestResponse response = RejectChangeRequestResponse.builder()
                .success(true)
                .message("Change request rejected successfully")
                .build();
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to reject change request {}", id, e);
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error(e.getMessage())
                .errorType(e.getClass().getName())
                .build();
            return ResponseEntity.internalServerError().body(errorResponse);
        }
    }

    /**
     * Cancel a change request
     * Only the user who created the change request can cancel it
     * Administrators can only approve or reject, not cancel
     */
    @PostMapping("/{id}/cancel")
    public ResponseEntity<?> cancelChangeRequest(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        try {
            String userId = requireUserId(currentUser);
            Optional<ChangeRequest> requestOpt = changeRequestRepository.findById(id);
            
            if (requestOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            
            ChangeRequest request = requestOpt.get();
            
            // Only the creator can cancel their own change request
            if (!userId.equals(request.getCreatedBy())) {
                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "You can only cancel your own change requests");
            }
            
            // Only allow canceling pending change requests
            if (request.getStatus() != ChangeRequestStatus.PENDING) {
                ErrorResponse errorResponse = ErrorResponse.builder()
                    .success(false)
                    .error("Only pending change requests can be cancelled")
                    .errorType("ValidationException")
                    .build();
                return ResponseEntity.badRequest().body(errorResponse);
            }
            
            // Update change request status to CANCELLED
            request.setStatus(ChangeRequestStatus.CANCELLED);
            changeRequestRepository.save(request);
            
            Map<String, Object> response = Map.of(
                "success", true,
                "message", "Change request cancelled successfully"
            );
            
            return ResponseEntity.ok(response);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to cancel change request {}", id, e);
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error(e.getMessage())
                .errorType(e.getClass().getName())
                .build();
            return ResponseEntity.internalServerError().body(errorResponse);
        }
    }

    /**
     * Get distinct fact types that have change requests
     */
    @GetMapping("/fact-types")
    public ResponseEntity<List<String>> getFactTypes() {
        try {
            List<FactType> factTypes = changeRequestRepository.findDistinctFactTypes();
            List<String> factTypeValues = factTypes.stream()
                .map(FactType::getValue)
                .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(factTypeValues);
        } catch (Exception e) {
            log.error("Failed to fetch fact types", e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Get all scheduled deployments
     */
    @GetMapping("/scheduled-deployments")
    public ResponseEntity<List<rule.engine.org.app.domain.entity.ui.ScheduledDeployment>> getScheduledDeployments(
            @RequestParam(required = false) String status) {
        try {
            List<rule.engine.org.app.domain.entity.ui.ScheduledDeployment> deployments;
            
            if (status != null && !status.isEmpty()) {
                rule.engine.org.app.domain.entity.ui.ScheduledDeployment.DeploymentStatus statusEnum = 
                    rule.engine.org.app.domain.entity.ui.ScheduledDeployment.DeploymentStatus.valueOf(status.toUpperCase());
                deployments = scheduledDeploymentRepository.findByStatusOrderByScheduledTimeDesc(statusEnum);
            } else {
                deployments = scheduledDeploymentRepository.findAll();
            }
            
            return ResponseEntity.ok(deployments);
        } catch (Exception e) {
            log.error("Failed to fetch scheduled deployments", e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Get upcoming scheduled deployments (PENDING and in future)
     */
    @GetMapping("/scheduled-deployments/upcoming")
    public ResponseEntity<List<rule.engine.org.app.domain.entity.ui.ScheduledDeployment>> getUpcomingDeployments() {
        try {
            List<rule.engine.org.app.domain.entity.ui.ScheduledDeployment> deployments = 
                scheduledDeploymentRepository.findByStatusAndScheduledTimeGreaterThanOrderByScheduledTimeAsc(
                    rule.engine.org.app.domain.entity.ui.ScheduledDeployment.DeploymentStatus.PENDING,
                    Instant.now()
                );
            return ResponseEntity.ok(deployments);
        } catch (Exception e) {
            log.error("Failed to fetch upcoming deployments", e);
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Cancel a scheduled deployment
     */
    @PostMapping("/scheduled-deployments/{id}/cancel")
    public ResponseEntity<?> cancelScheduledDeployment(@PathVariable Long id) {
        try {
            deploymentSchedulerService.cancelDeployment(id);
            
            Map<String, Object> response = Map.of(
                "success", true,
                "message", "Scheduled deployment cancelled successfully"
            );
            
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error(e.getMessage())
                .errorType("ValidationException")
                .build();
            return ResponseEntity.badRequest().body(errorResponse);
        } catch (Exception e) {
            log.error("Failed to cancel scheduled deployment {}", id, e);
            ErrorResponse errorResponse = ErrorResponse.builder()
                .success(false)
                .error(e.getMessage())
                .errorType(e.getClass().getName())
                .build();
            return ResponseEntity.internalServerError().body(errorResponse);
        }
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

    private void requireAdministrator(UserPrincipal currentUser) {
        if (!isAdministrator(currentUser)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Only RULE_ADMINISTRATOR can perform this action");
        }
    }

    /**
     * Build ChangeRequestResponse DTO from ChangeRequest entity
     * Maps UUIDs to display names for user fields
     */
    private ChangeRequestResponse buildChangeRequestResponse(ChangeRequest request) {
        return ChangeRequestResponse.builder()
            .id(request.getId())
            .factType(request.getFactType() != null ? request.getFactType().getValue() : null)
            .title(request.getTitle())
            .description(request.getDescription())
            .status(request.getStatus() != null ? request.getStatus().getValue() : null)
            .changesJson(request.getChangesJson())
            .approvedBy(userDisplayNameService.getDisplayName(request.getApprovedBy()))
            .approvedDate(request.getApprovedDate())
            .rejectedBy(userDisplayNameService.getDisplayName(request.getRejectedBy()))
            .rejectedDate(request.getRejectedDate())
            .rejectionReason(request.getRejectionReason())
            .createdAt(request.getCreatedAt())
            .createdBy(userDisplayNameService.getDisplayName(request.getCreatedBy()))
            .validationStatus(request.getValidationStatus())
            .validationMessage(request.getValidationMessage())
            .validationReleaseId(request.getValidationReleaseId())
            .validationRuleCount(request.getValidationRuleCount())
            .validationError(request.getValidationError())
            .validationCheckedAt(request.getValidationCheckedAt())
            .validationResultJson(request.getValidationResultJson())
            .executionTestStatus(request.getExecutionTestStatus())
            .executionTestMessage(request.getExecutionTestMessage())
            .executionTestHitsCount(request.getExecutionTestHitsCount())
            .executionTestTotalScore(request.getExecutionTestTotalScore())
            .executionTestFinalAction(request.getExecutionTestFinalAction())
            .executionTestResultJson(request.getExecutionTestResultJson())
            .build();
    }
}

