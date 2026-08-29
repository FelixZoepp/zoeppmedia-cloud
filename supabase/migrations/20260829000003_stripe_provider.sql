-- Allow 'stripe' as provider in mandates table
ALTER TABLE mandates DROP CONSTRAINT IF EXISTS mandates_provider_check;
ALTER TABLE mandates ADD CONSTRAINT mandates_provider_check CHECK (provider IN ('mollie', 'stripe'));

-- Allow 'stripe' as system in integration_logs table
ALTER TABLE integration_logs DROP CONSTRAINT IF EXISTS integration_logs_system_check;
ALTER TABLE integration_logs ADD CONSTRAINT integration_logs_system_check CHECK (system IN ('lexoffice', 'mollie', 'stripe'));

-- Add stripe_payment_id column to billing_runs (parallel to mollie_payment_id)
ALTER TABLE billing_runs ADD COLUMN IF NOT EXISTS stripe_payment_id TEXT;
