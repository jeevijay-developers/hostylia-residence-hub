# Generates SEND_SMS_HOOK_SECRET for Supabase Auth Send SMS hook.
# Format required by supabase/config.toml: v1,whsec_<base64> (min 32 chars after prefix).
#
# Usage:
#   .\scripts\generate-sms-hook-secret.ps1
#   .\scripts\generate-sms-hook-secret.ps1 -WriteFunctionsEnv
#
# If production already has a hook secret in Supabase Dashboard → Auth → Hooks,
# copy that value instead of generating a new one (Auth + Edge must match).

param(
    [switch]$WriteFunctionsEnv
)

$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = "v1,whsec_$([Convert]::ToBase64String($bytes))"

Write-Host ""
Write-Host "SEND_SMS_HOOK_SECRET=$secret" -ForegroundColor Green
Write-Host ""
Write-Host "Add this line to:" -ForegroundColor Yellow
Write-Host "  - .env.supabase-secrets (for: supabase secrets set --env-file ...)"
Write-Host "  - supabase/functions/.env (for: supabase functions deploy)"
Write-Host "  - Supabase Dashboard → Project Settings → Edge Functions → Secrets"
Write-Host ""

if ($WriteFunctionsEnv) {
    $target = Join-Path $PSScriptRoot "..\supabase\functions\.env"
    $target = [System.IO.Path]::GetFullPath($target)
    $line = "SEND_SMS_HOOK_SECRET=$secret"
    if (Test-Path $target) {
        $content = Get-Content $target -Raw
        if ($content -match 'SEND_SMS_HOOK_SECRET=') {
            $content = [regex]::Replace($content, 'SEND_SMS_HOOK_SECRET=.*', $line)
            Set-Content -Path $target -Value $content.TrimEnd() -NoNewline
            Add-Content -Path $target -Value ""
        } else {
            Add-Content -Path $target -Value $line
        }
    } else {
        Set-Content -Path $target -Value $line
    }
    Write-Host "Wrote $target" -ForegroundColor Green
}
