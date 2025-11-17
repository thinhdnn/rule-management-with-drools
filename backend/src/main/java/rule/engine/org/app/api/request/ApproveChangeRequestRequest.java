package rule.engine.org.app.api.request;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * DTO for approve change request request body with deployment options
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApproveChangeRequestRequest {
    /**
     * User who approved the change request
     */
    private String approvedBy;
    
    /**
     * Deployment option: IMMEDIATE or SCHEDULED
     */
    private DeploymentOption deploymentOption;
    
    /**
     * Scheduled deployment time (required if deploymentOption = SCHEDULED)
     */
    private Instant scheduledTime;
    
    /**
     * Optional notes for deployment
     */
    private String deploymentNotes;
    
    public enum DeploymentOption {
        IMMEDIATE,
        SCHEDULED
    }
}

