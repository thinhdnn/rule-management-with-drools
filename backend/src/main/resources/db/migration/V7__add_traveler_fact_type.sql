-- Add Traveler to fact_type check constraints

-- Update scheduled_deployments table
ALTER TABLE scheduled_deployments
DROP CONSTRAINT IF EXISTS chk_scheduled_deployments_fact_type;

ALTER TABLE scheduled_deployments
ADD CONSTRAINT chk_scheduled_deployments_fact_type
    CHECK (fact_type IN ('Declaration', 'CargoReport', 'Traveler'));

-- Update rule_deployment_snapshots table
ALTER TABLE rule_deployment_snapshots
DROP CONSTRAINT IF EXISTS chk_rule_deployment_snapshots_fact_type;

ALTER TABLE rule_deployment_snapshots
ADD CONSTRAINT chk_rule_deployment_snapshots_fact_type
    CHECK (fact_type IN ('Declaration', 'CargoReport', 'Traveler'));

