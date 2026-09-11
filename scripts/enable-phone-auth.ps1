# Enables Supabase Phone OTP (fixes "Unsupported phone provider").
# OTP delivery stays on the Send SMS hook → send-sms-hook Edge fn (MSG91).
#
# Usage (from repo root):
#   .\scripts\enable-phone-auth.ps1
#
# Or with an explicit token from https://supabase.com/dashboard/account/tokens:
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
#   .\scripts\enable-phone-auth.ps1

$ErrorActionPreference = "Stop"
$ProjectRef = "umznrrdqduynifpatslb"

function Get-SupabaseAccessToken {
    if ($env:SUPABASE_ACCESS_TOKEN) {
        return $env:SUPABASE_ACCESS_TOKEN.Trim()
    }

    Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CredReadHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, uint type, uint reserved, out IntPtr credential);
    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool CredFree(IntPtr cred);
    public static string ReadGeneric(string target) {
        IntPtr credPtr;
        if (!CredRead(target, 1, 0, out credPtr)) return null;
        try {
            var cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
            if (cred.CredentialBlobSize == 0) return null;
            var bytes = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, bytes, 0, (int)cred.CredentialBlobSize);
            return Encoding.UTF8.GetString(bytes).Trim('\0');
        } finally {
            CredFree(credPtr);
        }
    }
}
"@

    $token = [CredReadHelper]::ReadGeneric("Supabase CLI:supabase")
    if (-not $token) {
        throw "No Supabase access token. Run 'supabase login' or set SUPABASE_ACCESS_TOKEN."
    }
    return $token
}

function Read-HookSecret {
    $path = Join-Path $PSScriptRoot "..\supabase\functions\.env"
    $path = [System.IO.Path]::GetFullPath($path)
    if (-not (Test-Path $path)) {
        throw "Missing $path. Run .\scripts\generate-sms-hook-secret.ps1 -WriteFunctionsEnv first."
    }
    $line = Get-Content $path | Where-Object { $_ -match '^SEND_SMS_HOOK_SECRET=' } | Select-Object -First 1
    if (-not $line) { throw "SEND_SMS_HOOK_SECRET not found in $path" }
    return ($line -replace '^SEND_SMS_HOOK_SECRET=', '').Trim()
}

$token = Get-SupabaseAccessToken
$hookSecret = Read-HookSecret
$hookUri = "https://$ProjectRef.supabase.co/functions/v1/send-sms-hook"

$body = @{
    external_phone_enabled       = $true
    sms_provider                 = "twilio"
    sms_twilio_account_sid       = "AC00000000000000000000000000000000"
    sms_twilio_message_service_sid = "MG00000000000000000000000000000000"
    sms_twilio_auth_token          = "placeholder_not_used_when_sms_hook_enabled"
    sms_enable_signup              = $true
    sms_enable_confirmations       = $true
    hook_send_sms_enabled          = $true
    hook_send_sms_uri              = $hookUri
    hook_send_sms_secrets          = $hookSecret
} | ConvertTo-Json

$headers = @{
    Authorization  = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "PATCH auth config on $ProjectRef ..."
$response = Invoke-RestMethod `
    -Method Patch `
    -Uri "https://api.supabase.com/v1/projects/$ProjectRef/config/auth" `
    -Headers $headers `
    -Body $body

if ($response.external_phone_enabled -ne $true) {
    throw "Phone provider still disabled after PATCH. Check org role (Owner/Developer)."
}

Write-Host "Phone provider enabled. Send SMS hook: $($response.hook_send_sms_enabled)" -ForegroundColor Green
Write-Host "Try login again with your phone number."
