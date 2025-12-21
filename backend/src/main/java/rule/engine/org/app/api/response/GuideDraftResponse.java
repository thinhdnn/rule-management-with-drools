package rule.engine.org.app.api.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/**
 * Response DTO for rule guide draft.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GuideDraftResponse {

    @JsonProperty("id")
    private UUID id;

    @JsonProperty("step")
    private String step;

    @JsonProperty("method")
    private String method;

    @JsonProperty("flowState")
    private Object flowState;

    @JsonProperty("manualFormData")
    private Object manualFormData;

    @JsonProperty("aiFormData")
    private Object aiFormData;

    @JsonProperty("savedRuleId")
    private Long savedRuleId;

    @JsonProperty("createdAt")
    private Instant createdAt;

    @JsonProperty("updatedAt")
    private Instant updatedAt;
}

