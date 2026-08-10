-- Fee plan components had no way to distinguish "amount left blank/typo → 0"
-- from "this component is intentionally free" (e.g. a promotional waiver or
-- a deposit already covered elsewhere). The UI is about to start rejecting
-- amount_paise = 0 unless this flag is explicitly set, so the flag needs to
-- persist — otherwise re-editing a legitimately-zero component would
-- immediately fail the new validation.
ALTER TABLE public.fee_plan_components
  ADD COLUMN allow_zero_amount boolean NOT NULL DEFAULT false;
