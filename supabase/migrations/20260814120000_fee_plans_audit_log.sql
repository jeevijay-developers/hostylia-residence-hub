-- Admin > Fee Plans > Edit/Delete: PRD money rules require delete to be
-- soft-delete + audit ("Delete = soft-delete + audit for all business
-- entities"). fee_plans already soft-deletes (deleteOrDeactivateFeePlan sets
-- status/deleted_at via UPDATE, never a real DELETE), and the generic
-- audit_log_trigger() already exists (added in
-- 20260715104920_416ee7ab-c278-4bf3-9c3e-2df672a39b8d.sql) but was never
-- attached to any table — wiring it here rather than writing bespoke
-- logging code.
--
-- AFTER UPDATE OR DELETE only, not INSERT: the ask is to audit edits and
-- deletes, not plan creation. DELETE is included defensively even though
-- every current code path soft-deletes via UPDATE — nothing issues a real
-- DELETE on fee_plans today.
CREATE TRIGGER trg_fee_plans_audit
  AFTER UPDATE OR DELETE ON public.fee_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
