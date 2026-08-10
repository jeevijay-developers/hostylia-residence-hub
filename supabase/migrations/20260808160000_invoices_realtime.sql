-- PaymentEntryForm's invoice picker now subscribes to postgres_changes on
-- `invoices` to invalidate its cached list the moment an invoice is
-- settled/voided elsewhere (another tab, Razorpay, another staff member) —
-- but `invoices` was never added to the supabase_realtime publication, so
-- that subscription would silently receive nothing. Matches the same
-- ADD TABLE + REPLICA IDENTITY FULL pattern already used for
-- notices/notifications.
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER TABLE public.invoices REPLICA IDENTITY FULL;
