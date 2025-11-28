package rule.engine.org.app.domain.service.exception;

/**
 * Custom exception to capture Drools compilation details.
 */
public class RuleCompilationException extends RuntimeException {

    private final String factType;
    private final long version;
    private final int ruleCount;
    private final String errorDetails;
    private final String drlPreview;

    public RuleCompilationException(String factType,
                                    long version,
                                    int ruleCount,
                                    String errorDetails,
                                    String drlPreview) {
        super(buildMessage(factType, version, ruleCount));
        this.factType = factType;
        this.version = version;
        this.ruleCount = ruleCount;
        this.errorDetails = errorDetails;
        this.drlPreview = drlPreview;
    }

    private static String buildMessage(String factType, long version, int ruleCount) {
        return String.format("Rule compilation failed for factType=%s, version=%d, rules=%d",
                factType, version, ruleCount);
    }

    public String getFactType() {
        return factType;
    }

    public long getVersion() {
        return version;
    }

    public int getRuleCount() {
        return ruleCount;
    }

    public String getErrorDetails() {
        return errorDetails;
    }

    public String getDrlPreview() {
        return drlPreview;
    }
}

