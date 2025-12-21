-- Add missing audit columns to user_sessions table
-- These columns are required because UserSession extends BaseAuditableEntity

-- Add created_by column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_sessions' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE user_sessions ADD COLUMN created_by VARCHAR(255);
    END IF;
END $$;

-- Add last_modified_date column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_sessions' AND column_name = 'last_modified_date'
    ) THEN
        ALTER TABLE user_sessions ADD COLUMN last_modified_date TIMESTAMP;
    END IF;
END $$;

-- Add last_modified_by column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_sessions' AND column_name = 'last_modified_by'
    ) THEN
        ALTER TABLE user_sessions ADD COLUMN last_modified_by VARCHAR(255);
    END IF;
END $$;

