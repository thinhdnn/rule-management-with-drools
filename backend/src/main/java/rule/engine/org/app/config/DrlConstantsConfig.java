package rule.engine.org.app.config;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Configuration;
import rule.engine.org.app.util.DrlConstants;
import rule.engine.org.app.util.EntityScannerService;

/**
 * Configuration to initialize DrlConstants with EntityScannerService.
 * Ensures entity scanning happens before DrlConstants is used.
 */
@Configuration
public class DrlConstantsConfig implements InitializingBean {

    private final EntityScannerService entityScannerService;

    public DrlConstantsConfig(EntityScannerService entityScannerService) {
        this.entityScannerService = entityScannerService;
    }

    /**
     * Initialize DrlConstants with EntityScannerService after entity scanning is complete.
     * This runs after EntityScannerService's @PostConstruct method.
     * Using InitializingBean ensures this runs during bean initialization phase.
     */
    @Override
    public void afterPropertiesSet() {
        DrlConstants.setEntityScannerService(entityScannerService);
    }
}

