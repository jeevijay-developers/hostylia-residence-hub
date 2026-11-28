import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

/**
 * Shared notice vocabulary (channels, categories) and a property's default broadcast channels.
 *
 * The defaults live in `properties.settings.notice_default_channels` (string[]). They only pre-select the
 * channels of a NEW notice (Create notice dialog, Notice Composer); every notice still stores its own
 * `channels`, and the server re-checks provider availability when it is published. In-app is always part
 * of the defaults.
 */

export const NOTICE_CHANNELS = ["IN_APP", "WHATSAPP", "EMAIL", "SMS"] as const;
export type NoticeChannelKey = (typeof NOTICE_CHANNELS)[number];

export const NOTICE_CATEGORIES = [
  "GENERAL",
  "MESS",
  "MAINTENANCE",
  "ACADEMIC",
  "FACILITIES",
  "EVENT",
  "EMERGENCY",
] as const;
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];

const NOTICE_SETTINGS_KEY = "notice_default_channels";

export function isNoticeCategory(v: unknown): v is NoticeCategory {
  return typeof v === "string" && (NOTICE_CATEGORIES as readonly string[]).includes(v);
}

/**
 * The given channels with In-app always included, in display order. In-app cannot be switched off: the
 * scheduled publisher (fn_publish_scheduled_notices) delivers every notice in-app regardless of its
 * channels, so the UI and the stored channels never claim otherwise.
 */
export function withInApp(channels: readonly string[]): NoticeChannelKey[] {
  return NOTICE_CHANNELS.filter((c) => c === "IN_APP" || channels.includes(c));
}

function isChannel(v: unknown): v is NoticeChannelKey {
  return typeof v === "string" && (NOTICE_CHANNELS as readonly string[]).includes(v);
}

function settingsObject(settings: Json | null | undefined): { [key: string]: Json | undefined } {
  return typeof settings === "object" && settings !== null && !Array.isArray(settings)
    ? { ...settings }
    : {};
}

/** The property's default channels, In-app always first. Unset / malformed settings mean In-app only. */
export function readNoticeDefaultChannels(settings: Json | null | undefined): NoticeChannelKey[] {
  const raw = settingsObject(settings)[NOTICE_SETTINGS_KEY];
  return withInApp(Array.isArray(raw) ? raw.filter(isChannel) : []);
}

/**
 * Saves a property's default broadcast channels into `properties.settings` (merging; every other settings
 * key is kept). Hostel Admin only. The property is read through RLS and the role is checked against the
 * property's own tenant, never a tenant id sent by the browser.
 */
export const setNoticeDefaultChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        property_id: z.string().uuid(),
        channels: z.array(z.enum(NOTICE_CHANNELS)).max(NOTICE_CHANNELS.length),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prop, error: readError } = await supabase
      .from("properties")
      .select("tenant_id, settings")
      .eq("id", data.property_id)
      .maybeSingle();
    if (readError) throw new Error("Could not load the property. Please try again.");
    if (!prop) throw new Error("Property not found");

    const { data: isAdmin, error: roleError } = await supabase.rpc("has_tenant_role", {
      _user_id: userId,
      _tenant_id: prop.tenant_id,
      _role: "HOSTEL_ADMIN",
    });
    if (roleError) throw new Error("Could not verify your role. Please try again.");
    if (!isAdmin) throw new Error("Only a Hostel Admin can change the default notice channels");

    const channels = withInApp(data.channels);
    const settings = settingsObject(prop.settings);
    settings[NOTICE_SETTINGS_KEY] = channels;

    const { data: updated, error } = await supabase
      .from("properties")
      .update({ settings })
      .eq("id", data.property_id)
      .eq("tenant_id", prop.tenant_id)
      .select("id");
    if (error) throw new Error("Could not save the default channels. Please try again.");
    if (!updated || updated.length === 0) {
      throw new Error("You do not have permission to change this property's settings");
    }
    return { channels };
  });
