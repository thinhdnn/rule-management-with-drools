-- Create rule_guide_drafts table for storing rule creation guide drafts

CREATE TABLE IF NOT EXISTS rule_guide_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    step VARCHAR(50) NOT NULL,
    method VARCHAR(20),
    flow_state TEXT,
    manual_form_data TEXT,
    ai_form_data TEXT,
    saved_rule_id BIGINT,
    created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    last_modified_date TIMESTAMP,
    last_modified_by VARCHAR(255),
    
    CONSTRAINT fk_rule_guide_drafts_user 
        FOREIGN KEY (user_id) 
        REFERENCES user_accounts(id) 
        ON DELETE CASCADE,
    
    CONSTRAINT chk_rule_guide_drafts_step 
        CHECK (step IN ('method', 'build', 'validate', 'change', 'done')),
    
    CONSTRAINT chk_rule_guide_drafts_method 
        CHECK (method IS NULL OR method IN ('manual', 'ai'))
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_rule_guide_drafts_user_id ON rule_guide_drafts(user_id);

-- Create unique constraint to ensure one draft per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_guide_drafts_user_unique ON rule_guide_drafts(user_id);

