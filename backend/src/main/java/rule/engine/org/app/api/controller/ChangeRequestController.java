package rule.engine.org.app.api.controller;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import rule.engine.org.app.api.request.ApproveChangeRequestRequest;
import rule.engine.org.app.api.request.RejectChangeRequestRequest;
import rule.engine.org.app.api.response.CreateChangeRequestResponse;
import rule.engine.org.app.api.response.ApproveChangeRequestResponse;
import rule.engine.org.app.api.response.RejectChangeRequestResponse;
import rule.engine.org.app.api.response.ErrorResponse;
import rule.engine.org.app.domain.entity.ui.ChangeRequest;
import rule.engine.org.app.domain.entity.ui.ChangeRequestStatus;
import rule.engine.org.app.domain.entity.ui.FactType;
import rule.engine.org.app.domain.repository.ChangeRequestRepository;
import rule.engine.org.app.domain.repository.DecisionRuleRepository;
import rule.engine.org.app.domain.service.RuleEngineManager;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/change-requests")
public class ChangeRequestController {
    
    /**
     * DTO for change request changes JSON structure
     */
    @Data
    @NoArgsConstructor
    private static class ChangeRequestChanges {
        private List<Long> rulesToAdd = new ArrayList<>();
        private List<Long> rulesToUpdate = new ArrayList<>();
        private List<Long> rulesToDelete = new ArrayList<>();
    }
    
    /**
     * DTO for create change request request body
     */
    @Data
    @NoArgsConstructor
    private static class CreateChangeRequestRequest {
        private FactType factType = FactType.DECLARATION;
        private String title;
        private String description;
        private ChangeRequestChanges changes;
    }

    private static final Logger log = LoggerFactory.getLogger(ChangeRequestController.class);

    private final ChangeRequestRepository changeRequestRepository;
    private final DecisionRuleRepository decisionRuleRepository;
    private final RuleEngineManager ruleEngineManager;
    private final ObjectMapper objectMapper;

    public ChangeRequestController(
            ChangeRequestRepository changeRequestRepository,
            DecisionRuleRepository decisionRuleRepository,
            RuleEngineManager ruleEngineManager,
            ObjectMapper objectMapper) {
        this.changeRequestRepository = changeRequestRepository;
        this.decisionRuleRepository = decisionRuleRepository;
        this.ruleEngineManager = ruleEngineManager;
        this.objectMapper = objectMapper;
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
     */
    @GetMapping
    public ResponseEntity<List<ChangeRequest>> getAllChangeRequests(
            @RequestParam(required = false) String factType,
            @RequestParam(required = false) String status) {
        try {
            List<ChangeRequest> requests;
            FactType factTypeEnum = factType != null && !factType.isEmpty() 
                ? FactType.fromValue(factType) : null;
            ChangeRequestStatus statusEnum = status != null && !status.isEmpty() 
                ? ChangeRequestStatus.fromValue(status) : null;
            
            if (factTypeEnum != null && statusEnum != null) {
                requests = changeRequestRepository.findByFactTypeAndStatusOrderByCreatedAtDesc(factTypeEnum, statusEnum);
            } else if (factTypeEnum != null) {
                requests = changeRequestRepository.findByFactTypeOrderByCreatedAtDesc(factTypeEnum);
            } else if (statusEnum != null) {
                requests = changeRequestRepository.findByStatusOrderByCreatedAtDesc(statusEnum);
            } else {
                requests = changeRequestRepository.findAllByOrderByCreatedAtDesc();
            }
            return ResponseEntity.ok(requests);
        } catch (Exception e) {
            log.error("Failed to fetch change requests", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Get a specific change request by ID
     */
    @GetMapping("/{id}")
    public ResponseEntity<ChangeRequest> getChangeRequest(@PathVariable Long id) {
        try {
            Optional<ChangeRequest> request = changeRequestRepository.findById(id);
            return request.map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            log.error("Failed to fetch change request {}", id, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Create a new change request
     */
    @PostMapping
    public ResponseEntity<?> createChangeRequest(@RequestBody CreateChangeRequestRequest request) {
        try {
            // Build ChangeRequest entity using ObjectMapper for automatic mapping
            ChangeRequest changeRequest = new ChangeRequest();
            changeRequest.setFactType(request.getFactType() != null ? request.getFactType() : FactType.DECLARATION);
            changeRequest.setTitle(request.getTitle());
            changeRequest.setDescription(request.getDescription());
            changeRequest.setStatus(ChangeRequestStatus.PENDING);
            
            // Convert changes to JSON string
            if (request.getChanges() != null) {
                String changesJson = objectMapper.writeValueAsString(request.getChanges());
                changeRequest.setChangesJson(changesJson);
            }
            
            ChangeRequest saved = changeRequestRepository.save(changeRequest);
            
            CreateChangeRequestResponse response = CreateChangeRequestResponse.builder()
                .success(true)
                .id(saved.getId())
                .message("Change request created successfully")
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
     * Approve a change request
     * This will apply the changes and deploy the rules
     */
    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approveChangeRequest(
            @PathVariable Long id,
            @RequestBody(required = false) ApproveChangeRequestRequest requestBody) {
        try {
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
                    changes.setRulesToAdd(convertToLongList(changesMap.getOrDefault("rulesToAdd", List.of())));
                    changes.setRulesToUpdate(convertToLongList(changesMap.getOrDefault("rulesToUpdate", List.of())));
                    changes.setRulesToDelete(convertToLongList(changesMap.getOrDefault("rulesToDelete", List.of())));
                }
            } else {
                changes = new ChangeRequestChanges();
            }
            
            // Apply changes: activate rules to add/update, deactivate rules to delete
            // Activate rules to add/update
            changes.getRulesToAdd().forEach(ruleId -> 
                decisionRuleRepository.findById(ruleId).ifPresent(rule -> {
                    rule.setActive(true);
                    decisionRuleRepository.save(rule);
                })
            );
            changes.getRulesToUpdate().forEach(ruleId -> 
                decisionRuleRepository.findById(ruleId).ifPresent(rule -> {
                    rule.setActive(true);
                    decisionRuleRepository.save(rule);
                })
            );
            
            // Deactivate rules to delete
            changes.getRulesToDelete().forEach(ruleId -> 
                decisionRuleRepository.findById(ruleId).ifPresent(rule -> {
                    rule.setActive(false);
                    decisionRuleRepository.save(rule);
                })
            );
            
            // Update change request status
            request.setStatus(ChangeRequestStatus.APPROVED);
            request.setApprovedBy(requestBody != null && requestBody.getApprovedBy() != null 
                ? requestBody.getApprovedBy() : "system");
            request.setApprovedDate(Instant.now());
            changeRequestRepository.save(request);
            
            // Deploy rules for the fact type (this will rebuild and increment version)
            FactType factType = request.getFactType() != null ? request.getFactType() : FactType.DECLARATION;
            ruleEngineManager.deployRules(factType.getValue());
            
            ApproveChangeRequestResponse response = ApproveChangeRequestResponse.builder()
                .success(true)
                .message("Change request approved and changes deployed successfully")
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
     */
    @PostMapping("/{id}/reject")
    public ResponseEntity<?> rejectChangeRequest(
            @PathVariable Long id,
            @RequestBody RejectChangeRequestRequest requestBody) {
        try {
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
            request.setStatus(ChangeRequestStatus.REJECTED);
            request.setRejectedBy(requestBody != null && requestBody.getRejectedBy() != null 
                ? requestBody.getRejectedBy() : "system");
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
}

