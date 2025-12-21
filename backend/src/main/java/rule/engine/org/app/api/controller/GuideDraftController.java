package rule.engine.org.app.api.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import rule.engine.org.app.api.request.SaveGuideDraftRequest;
import rule.engine.org.app.api.response.ErrorResponse;
import rule.engine.org.app.api.response.GuideDraftResponse;
import rule.engine.org.app.domain.entity.ui.RuleGuideDraft;
import rule.engine.org.app.domain.repository.RuleGuideDraftRepository;
import rule.engine.org.app.security.UserPrincipal;

import java.util.Optional;

/**
 * Controller for managing rule guide drafts.
 */
@RestController
@RequestMapping("/api/guide-drafts")
@RequiredArgsConstructor
@Slf4j
public class GuideDraftController {

    private final RuleGuideDraftRepository draftRepository;
    private final ObjectMapper objectMapper;

    /**
     * Get current user's draft.
     */
    @GetMapping
    public ResponseEntity<?> getDraft(@AuthenticationPrincipal UserPrincipal currentUser) {
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            Optional<RuleGuideDraft> draftOpt = draftRepository.findByUserId(currentUser.getId());
            if (draftOpt.isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            RuleGuideDraft draft = draftOpt.get();
            GuideDraftResponse response = buildResponse(draft);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error getting draft for user {}", currentUser.getId(), e);
            ErrorResponse errorResponse = ErrorResponse.builder()
                    .success(false)
                    .error("Failed to get draft: " + e.getMessage())
                    .errorType(e.getClass().getSimpleName())
                    .build();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * Save or update draft.
     */
    @PostMapping
    public ResponseEntity<?> saveDraft(
            @RequestBody SaveGuideDraftRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            Optional<RuleGuideDraft> existingOpt = draftRepository.findByUserId(currentUser.getId());
            RuleGuideDraft draft;

            if (existingOpt.isPresent()) {
                draft = existingOpt.get();
            } else {
                draft = new RuleGuideDraft();
                draft.setUserId(currentUser.getId());
            }

            // Update fields
            if (request.getStep() != null) {
                draft.setStep(request.getStep());
            }
            if (request.getMethod() != null) {
                draft.setMethod(request.getMethod());
            }
            if (request.getSavedRuleId() != null) {
                draft.setSavedRuleId(request.getSavedRuleId());
            }

            // Serialize complex objects to JSON
            if (request.getFlowState() != null) {
                draft.setFlowState(objectMapper.writeValueAsString(request.getFlowState()));
            }
            if (request.getManualFormData() != null) {
                draft.setManualFormData(objectMapper.writeValueAsString(request.getManualFormData()));
            }
            if (request.getAiFormData() != null) {
                draft.setAiFormData(objectMapper.writeValueAsString(request.getAiFormData()));
            }

            RuleGuideDraft saved = draftRepository.save(draft);
            GuideDraftResponse response = buildResponse(saved);
            return ResponseEntity.ok(response);
        } catch (JsonProcessingException e) {
            log.error("Error serializing draft data for user {}", currentUser.getId(), e);
            ErrorResponse errorResponse = ErrorResponse.builder()
                    .success(false)
                    .error("Failed to serialize draft data: " + e.getMessage())
                    .errorType("SerializationException")
                    .build();
            return ResponseEntity.badRequest().body(errorResponse);
        } catch (Exception e) {
            log.error("Error saving draft for user {}", currentUser.getId(), e);
            ErrorResponse errorResponse = ErrorResponse.builder()
                    .success(false)
                    .error("Failed to save draft: " + e.getMessage())
                    .errorType(e.getClass().getSimpleName())
                    .build();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * Delete current user's draft.
     */
    @DeleteMapping
    public ResponseEntity<?> deleteDraft(@AuthenticationPrincipal UserPrincipal currentUser) {
        if (currentUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            draftRepository.deleteByUserId(currentUser.getId());
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            log.error("Error deleting draft for user {}", currentUser.getId(), e);
            ErrorResponse errorResponse = ErrorResponse.builder()
                    .success(false)
                    .error("Failed to delete draft: " + e.getMessage())
                    .errorType(e.getClass().getSimpleName())
                    .build();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    private GuideDraftResponse buildResponse(RuleGuideDraft draft) {
        try {
            GuideDraftResponse.GuideDraftResponseBuilder builder = GuideDraftResponse.builder()
                    .id(draft.getId())
                    .step(draft.getStep())
                    .method(draft.getMethod())
                    .savedRuleId(draft.getSavedRuleId())
                    .createdAt(draft.getCreatedAt())
                    .updatedAt(draft.getUpdatedAt());

            // Deserialize JSON strings to objects
            if (draft.getFlowState() != null) {
                builder.flowState(objectMapper.readValue(draft.getFlowState(), Object.class));
            }
            if (draft.getManualFormData() != null) {
                builder.manualFormData(objectMapper.readValue(draft.getManualFormData(), Object.class));
            }
            if (draft.getAiFormData() != null) {
                builder.aiFormData(objectMapper.readValue(draft.getAiFormData(), Object.class));
            }

            return builder.build();
        } catch (JsonProcessingException e) {
            log.error("Error deserializing draft data for draft {}", draft.getId(), e);
            // Return response without deserialized data
            return GuideDraftResponse.builder()
                    .id(draft.getId())
                    .step(draft.getStep())
                    .method(draft.getMethod())
                    .savedRuleId(draft.getSavedRuleId())
                    .createdAt(draft.getCreatedAt())
                    .updatedAt(draft.getUpdatedAt())
                    .build();
        }
    }
}

