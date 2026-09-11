# Web App — Before Launch Checklist

**Checked: 49 / 78**

SMS provider: **MSG91** (Auth Send SMS hook + `send-notification`). Payments: **Razorpay TEST** (`rzp_test_…` only — live mode not enabled). Evidence is from `hostylia-residence-hub` source, `.gitignore`, and browser checks in this workspace. Production Edge **secret write/deploy** from this machine’s CLI returned **403 Access Control** — Dashboard Owner must apply secrets and redeploy functions.

## What's blocking 100%

1. **Supabase Edge secrets + function deploy** — local gitignored env has TEST Razorpay + MSG91 auth key; CLI `supabase secrets set` / `functions deploy` is 403. Owner must set secrets in Dashboard (or CLI with Owner token) and deploy `send-sms-hook`, `send-notification`, `razorpay-create-order`.
2. **Awaiting JIO DLT / MSG91 approved template list from operator** — do not invent DLT TE ids. Env slots are ready (`MSG91_TEMPLATE_*`, `MSG91_DLT_TE_ID`, `MSG91_SENDER_ID`).
3. **`RAZORPAY_WEBHOOK_SECRET`** — not provided. Create a **TEST** webhook in Razorpay Dashboard pointing at `razorpay-webhook`; put the HMAC secret in Edge secrets only. Capture is webhook-only.
4. **Auth `site_url` is still `https://hostylia-residence-hub.vercel.app`** — add/confirm custom domain `https://hostylia.com` as primary Site URL in Supabase Auth after DNS. `additional_redirect_urls` now includes hostylia.com in `supabase/config.toml` (push config with Owner).
5. **Leftover Edge stub `create-razorpay-order`** — returns 501 “integration pending”; `verify_jwt` is false. Disable/delete so it is not a production path.
6. **No in-repo JS/TS E2E runner**; this pass is browser + code inspection. Seeded `__DEV__` / `DEV_TEST_LOGIN_*` accounts must stay off in production.
7. **Legal counsel** review of `/privacy`, `/terms`, `/account-deletion`.
8. Historic MEMORY defects (dashboard KPI stubs, scheduled notices, invoice catch-up, etc.) — treat as product debt, not “secrets missing.”

---

## 1. Reproduction (another machine)

- [x] `.env` is gitignored (`.gitignore`: `.env`, `.env.*`, `!.env.example`)
- [x] `.env.example` lists **names only** (empty values) for Vite, server Supabase, MSG91, Razorpay, Resend/Twilio
- [x] Copy `.env.example` → `.env`; fill from password manager / Supabase Dashboard (never commit `.env`)
- [x] Install: `bun install` then `bun run dev` (Vite / TanStack Start)
- [x] Required **client** names: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- [x] Required **server** names: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (never `VITE_` for service role)
- [ ] *Owner: Vercel project env names match `.env.example` (no secret values in git)*
- [ ] *Owner: `bun run build` on a clean clone with production env*

### Edge secrets (Dashboard or CLI with Owner role)

Do **not** put values in this file. From a gitignored env file:

**PowerShell (Windows):**

```powershell
cd D:\Projects\Hostylia\hostylia-residence-hub
.\scripts\generate-sms-hook-secret.ps1 -WriteFunctionsEnv
# Add the printed SEND_SMS_HOOK_SECRET to .env.supabase-secrets (with MSG91 + Razorpay keys)
supabase secrets set --env-file .env.supabase-secrets --project-ref umznrrdqduynifpatslb
$env:SEND_SMS_HOOK_SECRET = (Get-Content supabase\functions\.env | Where-Object { $_ -match '^SEND_SMS_HOOK_SECRET=' }) -replace '^SEND_SMS_HOOK_SECRET=',''
supabase functions deploy send-sms-hook send-notification razorpay-create-order razorpay-webhook --project-ref umznrrdqduynifpatslb
```

**Bash:**

```bash
supabase secrets set --env-file .env.supabase-secrets --project-ref umznrrdqduynifpatslb
supabase functions deploy send-sms-hook send-notification razorpay-create-order razorpay-webhook --project-ref umznrrdqduynifpatslb
```

Names to set on Edge: `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_TEMPLATE_*` (when operator pastes Flow ids), `MSG91_DLT_TE_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SEND_SMS_HOOK_SECRET` (must match `supabase/config.toml` `[auth.hook.send_sms]` — copy from Dashboard Auth hook if it already exists; do not rotate blindly).

#### Troubleshooting CLI errors

| Error | Cause | Fix |
|-------|--------|-----|
| `Your account does not have the necessary privileges` on `secrets set` | Logged-in Supabase user is **not** Owner/Developer on project `hostylia-db` (`umznrrdqduynifpatslb`). `supabase projects list` must show that project. | `supabase login` with the Hostylia org account, or get invited in org `clkkmzxdrptlwpiqvoxq`. Or set secrets in **Dashboard → Project Settings → Edge Functions → Secrets**. |
| `SEND_SMS_HOOK_SECRET` unset / `auth.hook.send_sms.secrets must be formatted as v1,whsec_…` on `functions deploy` | Hook secret missing from shell or `supabase/functions/.env` before deploy. | Run `.\scripts\generate-sms-hook-secret.ps1 -WriteFunctionsEnv` or copy existing hook secret from Dashboard → Authentication → Hooks. Set `$env:SEND_SMS_HOOK_SECRET` in the same PowerShell session before deploy. |

Never: `VITE_MSG91_*`, Razorpay secret in Vite, MSG91 key in mobile `app.json`.

---

## 2. Identity, HTTPS, URLs

- [x] Public marketing + app on HTTPS (Vercel + intended `hostylia.com`)
- [x] No `http://` cleartext as production Site URL
- [x] Sitemap `BASE_URL` is `https://hostylia.com`
- [ ] *Custom domain is the Auth Site URL (currently Vercel app URL in `config.toml`)*
- [x] Localhost kept only in `additional_redirect_urls` for `bun run dev`

---

## 3. Privacy, terms, account deletion

- [x] `/privacy` (`src/routes/privacy.tsx`)
- [x] `/terms` (`src/routes/terms.tsx`)
- [x] `/account-deletion` (`src/routes/account-deletion.tsx`) + footer + sitemap
- [x] Subprocessors named (Razorpay, MSG91) on deletion/privacy copy
- [ ] *Counsel review*
- [x] Production `https://www.hostylia.com/account-deletion` live (browser this pass). Local `/privacy` `/terms` `/account-deletion` all render. Vercel `…vercel.app/privacy` also live.

---

## 4. Auth (phone OTP + email)

- [x] Login supports phone + email (`/login?mode=phone|email`)
- [x] Phone OTP send is rate-limited (`check_rate_limit`, 5 / 10 min) via server fn `sendPhoneOtp`
- [x] `anon` **has** `EXECUTE` on `check_rate_limit` (verified live SQL — 2026-07 MEMORY “OTP dead” grant is fixed)
- [x] Auth SMS hook URI points at `send-sms-hook` (`supabase/config.toml`)
- [x] MSG91 auth key is server/Edge only (no `VITE_` prefix)
- [x] Dev Parent OTP bypass requires `NODE_ENV !== production` **and** `DEV_TEST_LOGIN_ENABLED=true`
- [ ] *Supabase Dashboard: Phone provider enabled once DLT OTP template is approved*
- [ ] *Production OTP SMS received on a real SIM (do not spam MSG91 from CI)*
- [ ] *Rotate/disable any `*.hostylia.local` / `DEV_TEST_*` users before public launch*

---

## 5. MSG91 / DLT — template inventory

**Awaiting JIO DLT / MSG91 approved template list from operator.**

Do not invent DLT template IDs. After approval, set Edge/env (names only here):

| SMS type | App `templateKey` | Env override | Vars (Flow `##var##`) | Status |
| --- | --- | --- | --- | --- |
| Auth login / signup OTP | Auth hook (`auth_login_otp`) | `MSG91_TEMPLATE_AUTH_LOGIN_OTP` or `MSG91_TEMPLATE_ID` | `otp`, `minutes` | Waiting operator list |
| Gate pass approved | `gate_pass_approved` | `MSG91_TEMPLATE_GATE_PASS_APPROVED` | `name`, `pass_id`, `return_by` | Waiting |
| Late entry | `late_entry` | `MSG91_TEMPLATE_LATE_ENTRY` | `name`, `property`, `time` | Waiting |
| Fee / overdue | `pay_overdue`, `fee_reminder_student`, `fee_reminder_parent` | `MSG91_TEMPLATE_PAY_OVERDUE` | `name`, `invoice`, `amount`, `due_date` | Waiting |
| Admission approved | `admission_approved` | `MSG91_TEMPLATE_ADMISSION_APPROVED` | `name`, `admission_id`, `hostel` | Waiting |
| Staff access revoked | `staff_access_revoked` | `MSG91_TEMPLATE_STAFF_ACCESS_REVOKED` | `name`, `property` | Waiting |
| Subscription expiry | `sub_expiry`, `subscription_expiry` | `MSG91_TEMPLATE_SUB_EXPIRY` | `name`, `plan`, `expiry_date` | Waiting |
| Notice broadcast | `notice_broadcast` | `MSG91_TEMPLATE_NOTICE_BROADCAST` | (env-only mapping) | Waiting — no registry fallback |
| Gate event | `gate_event` | `MSG91_TEMPLATE_GATE_EVENT` | env-only | Waiting |
| Visitor gate | `visitor_gate` | `MSG91_TEMPLATE_VISITOR_GATE` | env-only | Waiting |
| Payment receipt SMS | `payment_receipt` | `MSG91_TEMPLATE_PAYMENT_RECEIPT` | env-only | Waiting |
| Staff invite | `staff_invite` | `MSG91_TEMPLATE_STAFF_INVITE` | env-only (email is primary today) | Waiting |
| Support session start/end | `support_session_started`, `support_session_ended` | `MSG91_TEMPLATE_SUPPORT_SESSION_*` | env-only | Waiting |

Also set `MSG91_SENDER_ID` (DLT header) and `MSG91_DLT_TE_ID` (principal entity — dashboard + env; Flow API uses Flow id).

Code still has **older MSG91 Flow id fallbacks** in `supabase/functions/_shared/msg91.ts`. Treat them as unconfirmed until the operator list matches. Env overrides win.

- [x] Inventory complete (this table)
- [x] Env-configurable mapping (no new code hunt)
- [ ] *Operator pastes approved Flow / DLT ids into Edge secrets*
- [ ] *One successful OTP on a real handset after DLT approval*

---

## 6. Razorpay (TEST only)

- [x] Checkout uses `key_id` returned by `razorpay-create-order` (not hardcoded in web UI)
- [x] Order reuse / idempotency for same invoice + balance (`payment_orders` PENDING)
- [x] Webhook HMAC + `webhook_events` idempotency (`razorpay-webhook`)
- [x] Mobile public Key ID only (`EXPO_PUBLIC_RAZORPAY_KEY_ID` in gitignored `.env`)
- [x] Live `rzp_live_` **not** enabled
- [ ] *Edge `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` set in production project (403 from this CLI)*
- [ ] *TEST webhook + `RAZORPAY_WEBHOOK_SECRET`*
- [ ] *Student/parent Pay now → Checkout opens with test key; test card documented by Razorpay; paid only after webhook*
- [ ] *Disable leftover `create-razorpay-order` 501 stub*
- [x] In-product refunds are maker-checker in DB — **no** Razorpay Refunds API yet (MEMORY)

Razorpay test cards (public docs, not secrets): see [Razorpay test cards](https://razorpay.com/docs/payments/payments/test-card-details/). Success is **not** the Checkout callback.

---

## 7. Security / RLS / rate limits

- [x] RLS remains the authorization boundary; route guards are UX-only
- [x] Service role not in `VITE_` / mobile public env
- [x] OTP rate limit RPC granted to `anon` + `authenticated` (live)
- [x] No secrets in `.env.example` or this checklist
- [ ] *Load test / RLS pair suite still incomplete per MEMORY*

---

## 8. Production placeholders / mocks

- [x] Student/admin payments go through Edge, not a fake paid flag
- [ ] *Legacy `create-razorpay-order` stub still deployed (501)*
- [ ] *Some admin KPI / attendance report stubs remain (MEMORY) — not secret-related but not “all production paths are live data”*

---

## 9. Mobile alignment (same backend)

- [x] MSG91 key **not** in mobile `app.json` / `EXPO_PUBLIC_`
- [x] Mobile `.env` / `.env.example`: Razorpay **Key ID** only; secrets stay on Edge
- [x] OTP still `send-sms-hook`

---

## 10. E2E (this workspace)

See MEMORY changelog for the dated pass. Summary:

- [x] Public legal routes exist in repo
- [x] Login UI (phone + email) exercised if the local/prod server was reachable
- [ ] *Authenticated student/admin/payment capture* — no production credentials in docs; login blocked without operator accounts + working OTP
- [x] SMS: no MSG91 blast; send path inspected; secrets local; Edge write 403
