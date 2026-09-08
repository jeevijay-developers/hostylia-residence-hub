-- Fee overdue SMS via MSG91 (pay_overdue / fee_reminder_* → MSG91 PAY_OVERDUE).
-- Adds SMS for T+3 and T+7 stages when student/guardian phone is present.
-- Email + in-app paths unchanged.

CREATE OR REPLACE FUNCTION public.fn_send_fee_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv record;
  guardian record;
  v_count int := 0;
  v_days_diff int;
  v_stage TEXT;
  v_key TEXT;
BEGIN
  FOR inv IN
    SELECT i.id, i.tenant_id, i.property_id, i.student_id, i.invoice_number,
           i.due_date, i.balance_paise,
           s.profile_id AS student_profile_id,
           s.email AS student_email,
           s.phone AS student_phone,
           s.full_name AS student_name
    FROM public.invoices i
    JOIN public.students s ON s.id = i.student_id
    WHERE i.deleted_at IS NULL
      AND i.status IN ('ISSUED','PARTIALLY_PAID','OVERDUE')
      AND i.balance_paise > 0
      AND i.due_date BETWEEN (current_date - INTERVAL '7 days') AND (current_date + INTERVAL '3 days')
  LOOP
    v_days_diff := (current_date - inv.due_date);
    v_stage := CASE
      WHEN v_days_diff = -3 THEN 'T-3'
      WHEN v_days_diff = 0  THEN 'DUE'
      WHEN v_days_diff = 3  THEN 'T+3'
      WHEN v_days_diff = 7  THEN 'T+7'
      ELSE NULL
    END;
    IF v_stage IS NULL THEN CONTINUE; END IF;

    IF inv.student_profile_id IS NOT NULL THEN
      v_key := 'fee:' || inv.id::text || ':student:' || v_stage;
      PERFORM public.fn_enqueue_in_app_notification(
        inv.tenant_id, inv.property_id, inv.student_profile_id,
        'FEE_REMINDER', 'fee_reminder_student',
        jsonb_build_object(
          'invoice_id', inv.id, 'invoice_number', inv.invoice_number,
          'balance_paise', inv.balance_paise, 'due_date', inv.due_date, 'stage', v_stage
        ),
        v_key
      );
      v_count := v_count + 1;
    END IF;

    IF inv.student_email IS NOT NULL THEN
      PERFORM public.fn_dispatch_notification(
        'EMAIL', 'fee_reminder_student',
        jsonb_build_object('email', inv.student_email),
        jsonb_build_object(
          'invoice_number', inv.invoice_number, 'balance_paise', inv.balance_paise,
          'due_date', inv.due_date, 'stage', v_stage,
          'name', COALESCE(inv.student_name, 'Student')
        ),
        'FEE_REMINDER', inv.tenant_id, inv.property_id,
        'fee:' || inv.id::text || ':student-email:' || v_stage
      );
    END IF;

    -- Overdue SMS (MSG91 PAY_OVERDUE) on T+3 / T+7
    IF v_stage IN ('T+3', 'T+7') AND inv.student_phone IS NOT NULL THEN
      PERFORM public.fn_dispatch_notification(
        'SMS', 'pay_overdue',
        jsonb_build_object('phone', inv.student_phone),
        jsonb_build_object(
          'name', COALESCE(inv.student_name, 'Student'),
          'invoice', inv.invoice_number,
          'invoice_number', inv.invoice_number,
          'amount', (inv.balance_paise::numeric / 100),
          'balance_paise', inv.balance_paise,
          'due_date', inv.due_date,
          'stage', v_stage
        ),
        'FEE_OVERDUE', inv.tenant_id, inv.property_id,
        'fee:' || inv.id::text || ':student-sms:' || v_stage
      );
      v_count := v_count + 1;
    END IF;

    FOR guardian IN
      SELECT g.profile_id AS uid, g.email AS email, g.phone AS phone, g.full_name AS gname
      FROM public.student_guardians sg
      JOIN public.guardians g ON g.id = sg.guardian_id
      WHERE sg.student_id = inv.student_id
        AND sg.unlinked_at IS NULL
        AND sg.can_pay_fees = true
        AND (g.profile_id IS NOT NULL OR g.email IS NOT NULL OR g.phone IS NOT NULL)
    LOOP
      IF guardian.uid IS NOT NULL THEN
        v_key := 'fee:' || inv.id::text || ':parent:' || guardian.uid::text || ':' || v_stage;
        PERFORM public.fn_enqueue_in_app_notification(
          inv.tenant_id, inv.property_id, guardian.uid,
          'FEE_REMINDER', 'fee_reminder_parent',
          jsonb_build_object(
            'invoice_id', inv.id, 'invoice_number', inv.invoice_number,
            'balance_paise', inv.balance_paise, 'due_date', inv.due_date, 'stage', v_stage
          ),
          v_key
        );
        v_count := v_count + 1;
      END IF;
      IF guardian.email IS NOT NULL THEN
        PERFORM public.fn_dispatch_notification(
          'EMAIL', 'fee_reminder_parent',
          jsonb_build_object('email', guardian.email),
          jsonb_build_object(
            'invoice_number', inv.invoice_number, 'balance_paise', inv.balance_paise,
            'due_date', inv.due_date, 'stage', v_stage,
            'name', COALESCE(guardian.gname, inv.student_name, 'Parent')
          ),
          'FEE_REMINDER', inv.tenant_id, inv.property_id,
          'fee:' || inv.id::text || ':parent-email:' || COALESCE(guardian.uid::text, guardian.email) || ':' || v_stage
        );
      END IF;
      IF v_stage IN ('T+3', 'T+7') AND guardian.phone IS NOT NULL THEN
        PERFORM public.fn_dispatch_notification(
          'SMS', 'pay_overdue',
          jsonb_build_object('phone', guardian.phone),
          jsonb_build_object(
            'name', COALESCE(guardian.gname, inv.student_name, 'Parent'),
            'invoice', inv.invoice_number,
            'invoice_number', inv.invoice_number,
            'amount', (inv.balance_paise::numeric / 100),
            'balance_paise', inv.balance_paise,
            'due_date', inv.due_date,
            'stage', v_stage
          ),
          'FEE_OVERDUE', inv.tenant_id, inv.property_id,
          'fee:' || inv.id::text || ':parent-sms:' || right(guardian.phone, 4) || ':' || v_stage
        );
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;
