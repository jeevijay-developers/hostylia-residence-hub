-- Default trial period for new plans is 7 days. Existing plan rows (Starter
-- 14, Professional 14, Enterprise 0) already have an explicit configured
-- value and are intentionally left untouched — only plans created from now
-- on without an explicit trial_days fall back to this default. The
-- plans_trial_days_check (trial_days >= 0) constraint already validates the
-- column; no schema change needed there.
ALTER TABLE public.plans ALTER COLUMN trial_days SET DEFAULT 7;
