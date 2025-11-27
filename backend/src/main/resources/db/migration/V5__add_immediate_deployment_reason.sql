-- Add immediate_deployment_reason column to scheduled_deployments table
ALTER TABLE scheduled_deployments 
ADD COLUMN IF NOT EXISTS immediate_deployment_reason TEXT;

