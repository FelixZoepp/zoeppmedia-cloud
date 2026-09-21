-- Task 7 Review: seedTemplatesForAccount idempotent machen.
CREATE UNIQUE INDEX uq_wa_templates_account_preset
  ON whatsapp_templates(wa_account_id, preset_key)
  WHERE preset_key IS NOT NULL;
