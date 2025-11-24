package rule.engine.org.app.config;

import jakarta.annotation.PostConstruct;
import org.springframework.context.annotation.Configuration;
import rule.engine.org.app.util.DrlConstants;
import rule.engine.org.app.util.EntityScannerService;

/**
 * Configuration to initialize DrlConstants with EntityScannerService.
 * Ensures entity scanning happens before DrlConstants is used.
 */
@Configuration
public class DrlConstantsConfig {

    private final EntityScannerService entityScannerService;

    public DrlConstantsConfig(EntityScannerService entityScannerService) {
        this.entityScannerService = entityScannerService;
    }

    /**
     * Initialize DrlConstants with EntityScannerService after entity scanning is complete.
     * This runs after EntityScannerService's @PostConstruct method.
     */
    @PostConstruct
    public void initializeDrlConstants() {
        DrlConstants.setEntityScannerService(entityScannerService);
    }
}

