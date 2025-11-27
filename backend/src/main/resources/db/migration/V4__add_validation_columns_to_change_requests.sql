ALTER TABLE change_requests
    ADD COLUMN IF NOT EXISTS validation_status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS validation_message TEXT,
    ADD COLUMN IF NOT EXISTS validation_release_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS validation_rule_count INTEGER,
    ADD COLUMN IF NOT EXISTS validation_error TEXT,
    ADD COLUMN IF NOT EXISTS validation_checked_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS validation_result_json JSONB,
    ADD COLUMN IF NOT EXISTS execution_test_status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS execution_test_message TEXT,
    ADD COLUMN IF NOT EXISTS execution_test_hits_count INTEGER,
    ADD COLUMN IF NOT EXISTS execution_test_total_score NUMERIC(19,2),
    ADD COLUMN IF NOT EXISTS execution_test_final_action VARCHAR(50),
    ADD COLUMN IF NOT EXISTS execution_test_result_json JSONB;

