-- Create user sessions table to track active JWT tokens
-- This allows invalidating tokens when DB is reset
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    issued_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by VARCHAR(255),
    last_modified_date TIMESTAMP,
    last_modified_by VARCHAR(255),
    
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

COMMENT ON TABLE user_sessions IS 'Tracks active JWT tokens/sessions. When DB is reset, all sessions are deleted, invalidating all tokens.';
COMMENT ON COLUMN user_sessions.token_hash IS 'SHA-256 hash of the JWT token for lookup';
COMMENT ON COLUMN user_sessions.issued_at IS 'When the token was issued (iat claim)';
COMMENT ON COLUMN user_sessions.expires_at IS 'When the token expires (exp claim)';

