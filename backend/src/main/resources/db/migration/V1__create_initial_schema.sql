-- Create initial database schema for Rule Engine
-- Consolidated schema including all migrations (V1-V10)

-- ========== CUSTOM TYPES ==========

-- Group types for logical grouping
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'group_type') THEN
        CREATE TYPE group_type AS ENUM ('AND','OR','NOT');
    END IF;
END$$;

-- Value types for type-safe condition values
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'value_type') THEN
        CREATE TYPE value_type AS ENUM (
            'STRING','INT','LONG','BIG_DECIMAL','DATE','BOOLEAN','ENUM','ARRAY','JSON'
        );
    END IF;
END$$;

-- Operator types for condition operators
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operator_type') THEN
        CREATE TYPE operator_type AS ENUM (
            'EQUALS','NOT_EQUALS','GT','GTE','LT','LTE',
            'IN','NOT_IN','BETWEEN',
            'STR_CONTAINS','STR_STARTS_WITH','STR_ENDS_WITH','MATCHES',
            'IS_NULL','IS_NOT_NULL'
        );
    END IF;
END$$;

-- ========== CORE TABLES ==========

-- Create decision_rules table
CREATE TABLE IF NOT EXISTS decision_rules (
    id BIGSERIAL PRIMARY KEY,
    rule_name VARCHAR(255) NOT NULL,
    label VARCHAR(255),
    rule_content TEXT NOT NULL,
    rule_action VARCHAR(50),
    rule_result TEXT,
    rule_score NUMERIC(19, 2),
    priority INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true NOT NULL,
    
    -- Fact type support (V4)
    fact_type VARCHAR(100) DEFAULT 'Declaration' NOT NULL,
    
    -- AI generation flag (V6)
    generated_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Versioning columns
    version INTEGER DEFAULT 1 NOT NULL,
    parent_rule_id BIGINT,
    is_latest BOOLEAN DEFAULT true NOT NULL,
    version_notes TEXT,
    
    -- Audit columns
    created_date TIMESTAMP,
    last_modified_date TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_by VARCHAR(255),
    
    -- Foreign key for versioning
    CONSTRAINT fk_parent_rule FOREIGN KEY (parent_rule_id) REFERENCES decision_rules(id)
);

-- Create rule_execution_results table
-- Note: declaration_id is stored as VARCHAR (declaration identifier) instead of FK
-- because Declaration entity is not persisted
CREATE TABLE IF NOT EXISTS rule_execution_results (
    id BIGSERIAL PRIMARY KEY,
    declaration_id VARCHAR(255) NOT NULL,
    decision_rule_id BIGINT NOT NULL,
    matched BOOLEAN NOT NULL DEFAULT false,
    rule_action VARCHAR(50),
    rule_result TEXT,
    rule_score NUMERIC(5, 2),
    executed_at TIMESTAMP NOT NULL,
    
    -- Audit columns
    created_date TIMESTAMP,
    last_modified_date TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_by VARCHAR(255),
    
    -- Foreign key to decision_rules only
    CONSTRAINT fk_execution_rule FOREIGN KEY (decision_rule_id) REFERENCES decision_rules(id) ON DELETE CASCADE
);

-- Create kie_container_versions table (V2)
CREATE TABLE IF NOT EXISTS kie_container_versions (
    id BIGSERIAL PRIMARY KEY,
    version BIGINT NOT NULL,
    rules_count INTEGER NOT NULL,
    rules_hash VARCHAR(64) NOT NULL,
    release_id VARCHAR(255),
    changes_description TEXT,
    rule_ids TEXT,
    
    -- Rule changes detail (V3)
    rule_changes_json JSONB,
    
    -- Fact type support (V4)
    fact_type VARCHAR(100) DEFAULT 'Declaration' NOT NULL,
    
    -- Audit columns
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_date TIMESTAMP,
    last_modified_by VARCHAR(255),
    
    -- Unique constraint for (fact_type, version) - V4
    CONSTRAINT uk_kie_container_versions_fact_type_version UNIQUE (fact_type, version)
);

-- Create change_requests table (V5)
CREATE TABLE IF NOT EXISTS change_requests (
    id BIGSERIAL PRIMARY KEY,
    fact_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    changes_json JSONB,
    
    -- Approval information
    approved_by VARCHAR(255),
    approved_date TIMESTAMP,
    rejected_by VARCHAR(255),
    rejected_date TIMESTAMP,
    rejection_reason TEXT,
    
    -- Audit columns
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_date TIMESTAMP,
    last_modified_by VARCHAR(255)
);

-- Create scheduled_deployments table (V8)
CREATE TABLE IF NOT EXISTS scheduled_deployments (
    id BIGSERIAL PRIMARY KEY,
    change_request_id BIGINT NOT NULL,
    fact_type VARCHAR(50) NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    deployment_notes TEXT,
    executed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    
    -- Audit fields
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_modified_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_by VARCHAR(255),
    
    -- Foreign key to change_requests
    CONSTRAINT fk_scheduled_deployments_change_request
        FOREIGN KEY (change_request_id)
        REFERENCES change_requests(id)
        ON DELETE CASCADE,
    
    -- Check constraints
    CONSTRAINT chk_scheduled_deployments_status
        CHECK (status IN ('PENDING', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    CONSTRAINT chk_scheduled_deployments_fact_type
        CHECK (fact_type IN ('Declaration', 'CargoReport'))
);

-- Create rule_deployment_snapshots table (V10)
CREATE TABLE IF NOT EXISTS rule_deployment_snapshots (
    id BIGSERIAL PRIMARY KEY,
    container_version INTEGER NOT NULL,
    fact_type VARCHAR(50) NOT NULL,
    rule_id BIGINT NOT NULL,
    rule_name VARCHAR(255) NOT NULL,
    rule_version INTEGER NOT NULL,
    rule_priority INTEGER,
    rule_active BOOLEAN NOT NULL DEFAULT true,
    rule_content TEXT,
    
    -- Audit fields
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_modified_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_by VARCHAR(255),
    
    -- Foreign key to decision_rules
    CONSTRAINT fk_rule_deployment_snapshots_rule
        FOREIGN KEY (rule_id)
        REFERENCES decision_rules(id)
        ON DELETE CASCADE,
    
    -- Check constraints
    CONSTRAINT chk_rule_deployment_snapshots_fact_type
        CHECK (fact_type IN ('Declaration', 'CargoReport'))
);

-- ========== RULE CONDITION SCHEMA ==========

-- Rule condition groups table (supports nested AND/OR/NOT logic)
CREATE TABLE IF NOT EXISTS rule_condition_group (
    id              BIGSERIAL PRIMARY KEY,
    decision_rule_id BIGINT NOT NULL REFERENCES decision_rules(id) ON DELETE CASCADE,
    parent_id       BIGINT REFERENCES rule_condition_group(id) ON DELETE CASCADE,
    type            group_type NOT NULL,
    order_index     INT NOT NULL DEFAULT 0,
    
    -- Audit columns
    created_date TIMESTAMP,
    last_modified_date TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_by VARCHAR(255)
);

-- Rule conditions table (leaf conditions with field, operator, and typed value)
CREATE TABLE IF NOT EXISTS rule_condition (
    id              BIGSERIAL PRIMARY KEY,
    group_id        BIGINT NOT NULL REFERENCES rule_condition_group(id) ON DELETE CASCADE,
    field_path      VARCHAR(512) NOT NULL,
    operator        operator_type NOT NULL,
    value_type      value_type NOT NULL,
    
    -- Value columns (only one should be used depending on value_type)
    value_text      TEXT,
    value_number    BIGINT,
    value_decimal   NUMERIC(38,12),
    value_boolean   BOOLEAN,
    value_date      TIMESTAMP,
    value_json      JSONB,
    
    -- Additional options (e.g., case sensitivity, regex flags)
    options_json    JSONB,
    order_index     INT NOT NULL DEFAULT 0,
    
    -- Audit columns
    created_date TIMESTAMP,
    last_modified_date TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_by VARCHAR(255)
);

-- ========== RULE OUTPUT SCHEMA ==========

-- Rule output groups table (supports nested AND/OR/NOT logic for outputs)
CREATE TABLE IF NOT EXISTS rule_output_group (
    id              BIGSERIAL PRIMARY KEY,
    decision_rule_id BIGINT NOT NULL REFERENCES decision_rules(id) ON DELETE CASCADE,
    parent_id       BIGINT REFERENCES rule_output_group(id) ON DELETE CASCADE,
    type            group_type NOT NULL,
    order_index     INT NOT NULL DEFAULT 0,
    
    -- Audit columns
    created_date TIMESTAMP,
    last_modified_date TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_by VARCHAR(255)
);

-- Rule outputs table (individual outputs with action, result, and score)
CREATE TABLE IF NOT EXISTS rule_output (
    id              BIGSERIAL PRIMARY KEY,
    group_id        BIGINT NOT NULL REFERENCES rule_output_group(id) ON DELETE CASCADE,
    decision_rule_id BIGINT REFERENCES decision_rules(id) ON DELETE CASCADE,
    action          VARCHAR(50),
    result          TEXT,
    score           NUMERIC(5, 2),
    flag            VARCHAR(255),
    document_type   VARCHAR(255),
    document_id     VARCHAR(255),
    description     TEXT,
    order_index     INT NOT NULL DEFAULT 0,
    
    -- Audit columns
    created_date TIMESTAMP,
    last_modified_date TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_by VARCHAR(255)
);

-- ========== INDEXES ==========

-- Decision rules indexes
CREATE INDEX IF NOT EXISTS idx_decision_rules_active ON decision_rules(active);
CREATE INDEX IF NOT EXISTS idx_decision_rules_priority ON decision_rules(priority);
CREATE INDEX IF NOT EXISTS idx_decision_rules_parent ON decision_rules(parent_rule_id);
CREATE INDEX IF NOT EXISTS idx_decision_rules_latest ON decision_rules(is_latest);
CREATE INDEX IF NOT EXISTS idx_decision_rules_version ON decision_rules(version);
CREATE INDEX IF NOT EXISTS idx_decision_rules_fact_type ON decision_rules(fact_type);
CREATE INDEX IF NOT EXISTS idx_decision_rules_generated_by_ai ON decision_rules(generated_by_ai);

-- Rule execution results indexes
CREATE INDEX IF NOT EXISTS idx_execution_declaration ON rule_execution_results(declaration_id);
CREATE INDEX IF NOT EXISTS idx_execution_rule ON rule_execution_results(decision_rule_id);
CREATE INDEX IF NOT EXISTS idx_execution_time ON rule_execution_results(executed_at);
CREATE INDEX IF NOT EXISTS idx_execution_action ON rule_execution_results(rule_action);
CREATE INDEX IF NOT EXISTS idx_execution_matched ON rule_execution_results(matched);

-- KieContainer versions indexes
CREATE INDEX IF NOT EXISTS idx_kie_container_versions_version ON kie_container_versions(version);
CREATE INDEX IF NOT EXISTS idx_kie_container_versions_created_at ON kie_container_versions(created_date DESC);
CREATE INDEX IF NOT EXISTS idx_kie_container_versions_fact_type ON kie_container_versions(fact_type);

-- Change requests indexes
CREATE INDEX IF NOT EXISTS idx_change_requests_fact_type ON change_requests(fact_type);
CREATE INDEX IF NOT EXISTS idx_change_requests_status ON change_requests(status);
CREATE INDEX IF NOT EXISTS idx_change_requests_created_date ON change_requests(created_date DESC);
CREATE INDEX IF NOT EXISTS idx_change_requests_fact_type_status ON change_requests(fact_type, status);

-- Scheduled deployments indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_deployments_status_scheduled_time ON scheduled_deployments(status, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_scheduled_deployments_change_request_id ON scheduled_deployments(change_request_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_deployments_fact_type ON scheduled_deployments(fact_type);

-- Rule deployment snapshots indexes
CREATE INDEX IF NOT EXISTS idx_rule_deployment_snapshots_fact_type_version ON rule_deployment_snapshots(fact_type, container_version);
CREATE INDEX IF NOT EXISTS idx_rule_deployment_snapshots_rule_id ON rule_deployment_snapshots(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_deployment_snapshots_container_version ON rule_deployment_snapshots(container_version);

-- Rule condition groups indexes
CREATE INDEX IF NOT EXISTS idx_rcg_rule ON rule_condition_group(decision_rule_id);
CREATE INDEX IF NOT EXISTS idx_rcg_parent ON rule_condition_group(parent_id);
CREATE INDEX IF NOT EXISTS idx_rcg_type ON rule_condition_group(type);

-- Rule conditions indexes
CREATE INDEX IF NOT EXISTS idx_rc_group ON rule_condition(group_id);
CREATE INDEX IF NOT EXISTS idx_rc_field ON rule_condition(field_path);
CREATE INDEX IF NOT EXISTS idx_rc_operator ON rule_condition(operator);
CREATE INDEX IF NOT EXISTS idx_rc_vtype ON rule_condition(value_type);

-- Rule output groups indexes
CREATE INDEX IF NOT EXISTS idx_rog_rule ON rule_output_group(decision_rule_id);
CREATE INDEX IF NOT EXISTS idx_rog_parent ON rule_output_group(parent_id);
CREATE INDEX IF NOT EXISTS idx_rog_type ON rule_output_group(type);

-- Rule outputs indexes
CREATE INDEX IF NOT EXISTS idx_ro_group ON rule_output(group_id);
CREATE INDEX IF NOT EXISTS idx_ro_rule ON rule_output(decision_rule_id);
CREATE INDEX IF NOT EXISTS idx_ro_action ON rule_output(action);

-- ========== COMMENTS ==========

-- Decision rules table
COMMENT ON TABLE decision_rules IS 'Stores decision rules with versioning support';
COMMENT ON COLUMN decision_rules.rule_content IS 'Complete DRL (Drools Rule Language) content for the rule';
COMMENT ON COLUMN decision_rules.version IS 'Version number of the rule';
COMMENT ON COLUMN decision_rules.parent_rule_id IS 'Reference to the original rule (for versions)';
COMMENT ON COLUMN decision_rules.is_latest IS 'Indicates if this is the latest version';
COMMENT ON COLUMN decision_rules.version_notes IS 'Notes about changes in this version';
COMMENT ON COLUMN decision_rules.fact_type IS 'Fact type this rule applies to (Declaration or CargoReport). Determines which KieContainer and metadata to use.';
COMMENT ON COLUMN decision_rules.generated_by_ai IS 'Flag indicating if this rule was generated by AI (true) or created manually (false)';

-- Rule execution results table
COMMENT ON TABLE rule_execution_results IS 'Stores results of rule executions';
COMMENT ON COLUMN rule_execution_results.declaration_id IS 'Declaration identifier (not FK, as Declaration is not persisted)';

-- KieContainer versions table
COMMENT ON TABLE kie_container_versions IS 'Tracks KieContainer versions and changes on each deployment';
COMMENT ON COLUMN kie_container_versions.version IS 'KieContainer version number (auto-increments on each deploy)';
COMMENT ON COLUMN kie_container_versions.rules_count IS 'Number of rules in this container version';
COMMENT ON COLUMN kie_container_versions.rules_hash IS 'MD5 hash of rules to detect changes';
COMMENT ON COLUMN kie_container_versions.release_id IS 'Drools ReleaseId for this container version';
COMMENT ON COLUMN kie_container_versions.changes_description IS 'Description of changes in this version';
COMMENT ON COLUMN kie_container_versions.rule_ids IS 'Comma-separated list of rule IDs included in this version';
COMMENT ON COLUMN kie_container_versions.rule_changes_json IS 'JSON object containing detailed rule changes: {added: [ruleIds], removed: [ruleIds], updated: [ruleIds]}';
COMMENT ON COLUMN kie_container_versions.fact_type IS 'Fact type this container version applies to (e.g., Declaration, Order, Customer).';

-- Change requests table
COMMENT ON TABLE change_requests IS 'Stores change requests for rule modifications that require approval before deployment';
COMMENT ON COLUMN change_requests.fact_type IS 'Fact type this change request applies to (e.g., Declaration, CargoReport)';
COMMENT ON COLUMN change_requests.title IS 'Title/summary of the change request';
COMMENT ON COLUMN change_requests.description IS 'Detailed description of the proposed changes';
COMMENT ON COLUMN change_requests.status IS 'Status of the change request: Pending, Approved, Rejected';
COMMENT ON COLUMN change_requests.changes_json IS 'JSON object containing proposed changes: {rulesToAdd: [ruleIds], rulesToUpdate: [ruleIds], rulesToDelete: [ruleIds]}';
COMMENT ON COLUMN change_requests.approved_by IS 'User who approved the change request';
COMMENT ON COLUMN change_requests.approved_date IS 'Date when the change request was approved';
COMMENT ON COLUMN change_requests.rejected_by IS 'User who rejected the change request';
COMMENT ON COLUMN change_requests.rejected_date IS 'Date when the change request was rejected';
COMMENT ON COLUMN change_requests.rejection_reason IS 'Reason for rejection if the change request was rejected';

-- Scheduled deployments table
COMMENT ON TABLE scheduled_deployments IS 'Tracks scheduled rule deployments. When change requests are approved with SCHEDULED option, deployments are queued here and executed by the scheduler service.';

-- Rule deployment snapshots table
COMMENT ON TABLE rule_deployment_snapshots IS 'Tracks which rules were deployed in each KieContainer version. This allows querying the exact composition of rules for any historical version.';

-- Rule condition groups table
COMMENT ON TABLE rule_condition_group IS 'Stores logical groups (AND/OR/NOT) for rule conditions';
COMMENT ON COLUMN rule_condition_group.decision_rule_id IS 'Reference to the rule this group belongs to';
COMMENT ON COLUMN rule_condition_group.parent_id IS 'Reference to parent group (for nested logic)';
COMMENT ON COLUMN rule_condition_group.type IS 'Logical operator: AND, OR, or NOT';
COMMENT ON COLUMN rule_condition_group.order_index IS 'Order within parent group or rule';

-- Rule conditions table
COMMENT ON TABLE rule_condition IS 'Stores individual rule conditions with field path, operator, and typed value';
COMMENT ON COLUMN rule_condition.field_path IS 'Path to the field (e.g., declaration.invoiceAmount)';
COMMENT ON COLUMN rule_condition.operator IS 'Operator to apply (EQUALS, GT, STR_CONTAINS, etc.)';
COMMENT ON COLUMN rule_condition.value_type IS 'Type of the value (STRING, INT, BIG_DECIMAL, etc.)';
COMMENT ON COLUMN rule_condition.value_text IS 'Value for STRING, ENUM types';
COMMENT ON COLUMN rule_condition.value_number IS 'Value for INT, LONG types';
COMMENT ON COLUMN rule_condition.value_decimal IS 'Value for BIG_DECIMAL type';
COMMENT ON COLUMN rule_condition.value_boolean IS 'Value for BOOLEAN type';
COMMENT ON COLUMN rule_condition.value_date IS 'Value for DATE type';
COMMENT ON COLUMN rule_condition.value_json IS 'Value for ARRAY, JSON types';
COMMENT ON COLUMN rule_condition.options_json IS 'Additional options (case sensitivity, regex flags, etc.)';

-- Rule output groups table
COMMENT ON TABLE rule_output_group IS 'Stores logical groups (AND/OR/NOT) for rule outputs';
COMMENT ON COLUMN rule_output_group.decision_rule_id IS 'Reference to the rule this group belongs to';
COMMENT ON COLUMN rule_output_group.parent_id IS 'Reference to parent group (for nested logic)';
COMMENT ON COLUMN rule_output_group.type IS 'Logical operator: AND, OR, or NOT';
COMMENT ON COLUMN rule_output_group.order_index IS 'Order within parent group or rule';

-- Rule outputs table
COMMENT ON TABLE rule_output IS 'Stores individual rule outputs with action, result message, and risk score';
COMMENT ON COLUMN rule_output.group_id IS 'Reference to the output group this output belongs to';
COMMENT ON COLUMN rule_output.decision_rule_id IS 'Reference to the decision rule (for convenience)';
COMMENT ON COLUMN rule_output.action IS 'Action to take (FLAG, APPROVE, REJECT, REVIEW, HOLD)';
COMMENT ON COLUMN rule_output.result IS 'Result message/description when rule matches';
COMMENT ON COLUMN rule_output.score IS 'Risk score to assign (0-100)';
COMMENT ON COLUMN rule_output.flag IS 'Optional flag label/category (e.g., HIGH_RISK, SUSPICIOUS)';
COMMENT ON COLUMN rule_output.document_type IS 'Optional related document type (e.g., INVOICE, LICENSE)';
COMMENT ON COLUMN rule_output.document_id IS 'Optional related document identifier';
COMMENT ON COLUMN rule_output.description IS 'Optional longer description for reporting';
COMMENT ON COLUMN rule_output.order_index IS 'Order within the group';
