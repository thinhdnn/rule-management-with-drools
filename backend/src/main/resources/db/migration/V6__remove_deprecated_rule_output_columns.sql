-- Remove deprecated rule output columns from decision_rules table
-- These columns are deprecated in favor of RuleOutput entities (one-to-many relationship)
-- Migration: V6

-- Drop columns from decision_rules table
ALTER TABLE decision_rules 
    DROP COLUMN IF EXISTS rule_action,
    DROP COLUMN IF EXISTS rule_result,
    DROP COLUMN IF EXISTS rule_score;

