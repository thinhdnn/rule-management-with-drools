-- Add execution_source column to track where rule execution originated from
-- Values: 'API' (from system API calls) or 'UI' (from UI test submissions)

ALTER TABLE rule_execution_results
ADD COLUMN IF NOT EXISTS execution_source VARCHAR(20) DEFAULT 'API';

-- Add check constraint to ensure valid values
ALTER TABLE rule_execution_results
ADD CONSTRAINT chk_execution_source 
    CHECK (execution_source IN ('API', 'UI'));

-- Add index for querying by execution source
CREATE INDEX IF NOT EXISTS idx_execution_source ON rule_execution_results(execution_source);

-- Add comment
COMMENT ON COLUMN rule_execution_results.execution_source IS 'Source of rule execution: API (from system API calls) or UI (from UI test submissions)';

