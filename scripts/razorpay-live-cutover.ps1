# Hostylia — Razorpay TEST → LIVE cutover (Edge secrets only)
#
# Prerequisites:
#   - Live Key ID starts with rzp_live_
#   - Webhook created in Razorpay Dashboard (Live mode) pointing to:
#     https://umznrrdqduynifpatslb.supabase.co/functions/v1/razorpay-webhook
#   - Events: payment.captured, payment.failed, order.paid (at minimum)
#
# Usage (from hostylia-residence-hub, with Owner CLI login):
#   1. Edit .env.supabase-secrets — replace RAZORPAY_* with live values + webhook secret
#   2. .\scripts\razorpay-live-cutover.ps1
#
# Never put RAZORPAY_KEY_SECRET or RAZORPAY_WEBHOOK_SECRET in mobile EXPO_PUBLIC_*.

$ErrorActionPreference = "Stop"
$ProjectRef = "umznrrdqduynifpatslb"
$SecretsFile = Join-Path $PSScriptRoot "..\.env.supabase-secrets"
$SecretsFile = [System.IO.Path]::GetFullPath($SecretsFile)

if (-not (Test-Path $SecretsFile)) {
    throw "Missing $SecretsFile"
}

$keyLine = Get-Content $SecretsFile | Where-Object { $_ -match '^RAZORPAY_KEY_ID=' } | Select-Object -First 1
if (-not $keyLine -or $keyLine -notmatch 'rzp_live_') {
    throw "RAZORPAY_KEY_ID in .env.supabase-secrets must be rzp_live_… before cutover. Still using TEST keys is OK for internal QA."
}

$hookLine = Get-Content $SecretsFile | Where-Object { $_ -match '^RAZORPAY_WEBHOOK_SECRET=' } | Select-Object -First 1
if (-not $hookLine -or ($hookLine -replace '^RAZORPAY_WEBHOOK_SECRET=','').Trim().Length -lt 8) {
    throw "RAZORPAY_WEBHOOK_SECRET is missing. Create a Live webhook in Razorpay Dashboard first."
}

Write-Host "Setting Edge secrets from $SecretsFile ..."
supabase secrets set --env-file $SecretsFile --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { throw "secrets set failed" }

Write-Host "Deploying razorpay-create-order + razorpay-webhook ..."
supabase functions deploy razorpay-create-order razorpay-webhook --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { throw "functions deploy failed" }

Write-Host "Done. Verify: pay a fee on device; payments.status = CAPTURED only after webhook." -ForegroundColor Green
Write-Host "Optional mobile: eas env:create --name EXPO_PUBLIC_RAZORPAY_KEY_ID --value rzp_live_… --environment production"
