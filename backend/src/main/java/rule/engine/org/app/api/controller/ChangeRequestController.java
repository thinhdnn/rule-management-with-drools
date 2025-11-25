package rule.engine.org.app.api.controller;

import lombok.Data;
import lombok.NoArgsConstructor;
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
            
            // Auto-detect changes vs deployed version (only for user's own rules)
            ChangeRequestChanges detectedChanges = detectChanges(factType, userId);
            
            // Build ChangeRequest entity
            ChangeRequest changeRequest = new ChangeRequest();
            changeRequest.setFactType(factType);
            changeRequest.setTitle(request.getTitle());
            changeRequest.setDescription(request.getDescription());
            changeRequest.setStatus(ChangeRequestStatus.PENDING);
            
            // Store auto-detected changes
            String changesJson = objectMapper.writeValueAsString(detectedChanges);
            changeRequest.setChangesJson(changesJson);
            
            ChangeRequest saved = changeRequestRepository.save(changeRequest);
            
            CreateChangeRequestResponse response = CreateChangeRequestResponse.builder()
                .success(true)
                .id(saved.getId())
                .message("Change request created successfully with " + 
                    (detectedChanges.getRulesToInclude().size() + detectedChanges.getRulesToExclude().size()) + 
                    " detected changes")
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
            .status(request.getStatus() != null ? request.getStatus().name() : null)
            .changesJson(request.getChangesJson())
            .approvedBy(userDisplayNameService.getDisplayName(request.getApprovedBy()))
            .approvedDate(request.getApprovedDate())
            .rejectedBy(userDisplayNameService.getDisplayName(request.getRejectedBy()))
            .rejectedDate(request.getRejectedDate())
            .rejectionReason(request.getRejectionReason())
            .createdAt(request.getCreatedAt())
            .createdBy(userDisplayNameService.getDisplayName(request.getCreatedBy()))
            .build();
    }
}

