import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INDIAN_STATES } from "@/lib/locations";

export interface PincodeLookup {
  found: boolean;
  /** District, as India Post names it (e.g. "Kota"). */
  city: string | null;
  /** Matched to our INDIAN_STATES spelling, or null if it couldn't be matched. */
  state: string | null;
  /** Post-office / locality names in this PIN, for the "Area" suggestions. */
  localities: string[];
}

const norm = (v: string) =>
  v
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z]/g, "");

// India Post spellings that differ from the official state/UT names.
const STATE_ALIASES: Record<string, (typeof INDIAN_STATES)[number]> = {
  chattisgarh: "Chhattisgarh",
  orissa: "Odisha",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
  newdelhi: "Delhi",
  nctofdelhi: "Delhi",
  dadraandnagarhaveli: "Dadra and Nagar Haveli and Daman and Diu",
  damananddiu: "Dadra and Nagar Haveli and Daman and Diu",
  andamanandnicobar: "Andaman and Nicobar Islands",
  jammuandkashmir: "Jammu and Kashmir",
};

function matchState(raw: string | undefined): string | null {
  if (!raw) return null;
  const key = norm(raw);
  return STATE_ALIASES[key] ?? INDIAN_STATES.find((s) => norm(s) === key) ?? null;
}

// India Post still uses some pre-rename district names.
const CITY_ALIASES: Record<string, string> = {
  Bangalore: "Bengaluru",
  "Bangalore Urban": "Bengaluru",
  "Bengaluru Urban": "Bengaluru",
  Gurgaon: "Gurugram",
  Mysore: "Mysuru",
  Mangalore: "Mangaluru",
  "Dakshina Kannada": "Mangaluru",
  Allahabad: "Prayagraj",
  Belgaum: "Belagavi",
  Gulbarga: "Kalaburagi",
  Shimoga: "Shivamogga",
  Tumkur: "Tumakuru",
  Calcutta: "Kolkata",
  Trivandrum: "Thiruvananthapuram",
  Thiruvananthapuram: "Thiruvananthapuram",
  Ernakulam: "Kochi",
  "Gautam Buddha Nagar": "Noida",
};

// PIN → place never changes, so remember answers for the life of the server instance.
const cache = new Map<string, PincodeLookup>();

/**
 * Indian PIN code → district, state and localities, via India Post's public
 * lookup (api.postalpincode.in). Called server-side so the browser's CSP and
 * CORS don't matter; only the 6-digit PIN is sent. Signed-in users only.
 * Never throws for "not found" or an unreachable service — the form simply
 * lets the admin type the city and state themselves.
 */
export const lookupIndianPincode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({ pin: z.string().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code") }).parse(d),
  )
  .handler(async ({ data }): Promise<PincodeLookup & { unavailable?: boolean }> => {
    const cached = cache.get(data.pin);
    if (cached) return cached;
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${data.pin}`, {
        signal: AbortSignal.timeout(6000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok)
        return { found: false, city: null, state: null, localities: [], unavailable: true };
      const body = (await res.json()) as {
        Status?: string;
        PostOffice?: { Name?: string; District?: string; State?: string }[] | null;
      }[];
      const offices = body?.[0]?.Status === "Success" ? (body[0].PostOffice ?? []) : [];
      const result: PincodeLookup =
        offices.length === 0
          ? { found: false, city: null, state: null, localities: [] }
          : {
              found: true,
              city: ((d) => (d ? (CITY_ALIASES[d] ?? d) : null))(offices[0].District?.trim()),
              state: matchState(offices[0].State),
              localities: Array.from(
                new Set(offices.map((o) => o.Name?.trim()).filter((n): n is string => !!n)),
              ).slice(0, 12),
            };
      cache.set(data.pin, result);
      return result;
    } catch {
      return { found: false, city: null, state: null, localities: [], unavailable: true };
    }
  });
