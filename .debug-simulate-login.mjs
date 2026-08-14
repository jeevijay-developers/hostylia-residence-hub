import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const phone = "+916260946173";

const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const { error: otpErr } = await anon.auth.signInWithOtp({ phone });
console.log("signInWithOtp ->", { otpErr: otpErr?.message ?? null, sentAt: new Date().toISOString() });
