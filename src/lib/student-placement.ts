import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { localDateInTimezone, usePropertyTimezone } from "@/lib/ops";

/**
 * Lookups backing the "Assign a bed" step of the Add student dialog. Admin-side
 * direct RLS reads, same filters as AllocationBoard.
 */

export const VACANT_BEDS_PAGE_SIZE = 20;

export interface VacantBedOption {
  id: string;
  code: string;
  roomNumber: string;
  roomId: string;
  /** Bed override, else the room's base rent; null when neither is set. */
  rentPaise: number | null;
}

/** Drop characters that are wildcards in ilike or separators in PostgREST's or(). */
function ilikeToken(value: string): string {
  return value.replace(/[%_,.()*\\]/g, "").trim();
}

/** Vacant beds in active rooms, searchable by room number or bed code. `q` is debounced by the caller. */
export function useVacantBeds(propertyId: string, q: string, page: number) {
  return useQuery({
    queryKey: ["students-tab", propertyId, "vacant-beds", q, page],
    enabled: !!propertyId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: VacantBedOption[]; total: number }> => {
      const from = page * VACANT_BEDS_PAGE_SIZE;
      let query = supabase
        .from("beds")
        .select(
          "id, code, room_id, rent_override_paise, rooms!inner(room_number, base_rent_paise)",
          {
            count: "exact",
          },
        )
        .eq("property_id", propertyId)
        .eq("status", "VACANT")
        .is("deleted_at", null)
        .eq("rooms.status", "ACTIVE")
        .is("rooms.deleted_at", null)
        // `code` repeats across rooms (every room has its own B1 …); `id` makes paging stable.
        .order("code")
        .order("id")
        .range(from, from + VACANT_BEDS_PAGE_SIZE - 1);

      const token = ilikeToken(q);
      if (token) {
        const { data: rooms, error: roomsError } = await supabase
          .from("rooms")
          .select("id")
          .eq("property_id", propertyId)
          .is("deleted_at", null)
          .ilike("room_number", `%${token}%`)
          .limit(100);
        if (roomsError) throw new Error("We couldn't search beds. Please try again.");
        const roomIds = (rooms ?? []).map((r) => r.id);
        query = query.or(
          [
            `code.ilike.%${token}%`,
            ...(roomIds.length ? [`room_id.in.(${roomIds.join(",")})`] : []),
          ].join(","),
        );
      }

      const { data, error, count } = await query;
      if (error) throw new Error("We couldn't load vacant beds. Please try again.");
      return {
        total: count ?? 0,
        rows: (data ?? []).map((b) => ({
          id: b.id,
          code: b.code,
          roomId: b.room_id,
          roomNumber: b.rooms.room_number,
          rentPaise: b.rent_override_paise ?? b.rooms.base_rent_paise ?? null,
        })),
      };
    },
  });
}

export interface FeePlanOption {
  id: string;
  name: string;
  code: string;
}

/** Active fee plans of the property, by name. */
export function usePropertyFeePlans(propertyId: string) {
  return useQuery({
    queryKey: ["students-tab", propertyId, "fee-plans"],
    enabled: !!propertyId,
    queryFn: async (): Promise<FeePlanOption[]> => {
      const { data, error } = await supabase
        .from("fee_plans")
        .select("id, name, code")
        .eq("property_id", propertyId)
        .eq("status", "ACTIVE")
        .is("deleted_at", null)
        .order("name");
      if (error) throw new Error("We couldn't load fee plans. Please try again.");
      return data ?? [];
    },
  });
}

export interface FeePlanAmounts {
  /** Sum of the plan's active RENT components; null when it has none. */
  rentPaise: number | null;
  /** Sum of the plan's active DEPOSIT components; null when it has none. */
  depositPaise: number | null;
}

export function useFeePlanAmounts(feePlanId: string | null) {
  return useQuery({
    queryKey: ["students-tab", "fee-plan-amounts", feePlanId],
    enabled: !!feePlanId,
    queryFn: async (): Promise<FeePlanAmounts> => {
      if (!feePlanId) return { rentPaise: null, depositPaise: null };
      const { data, error } = await supabase
        .from("fee_plan_components")
        .select("component_type, amount_paise")
        .eq("fee_plan_id", feePlanId)
        .eq("is_active", true)
        .in("component_type", ["RENT", "DEPOSIT"]);
      if (error) throw new Error("We couldn't load the fee plan amounts. Please try again.");
      const rows = data ?? [];
      const sum = (type: string) => {
        const matching = rows.filter((r) => r.component_type === type);
        return matching.length ? matching.reduce((acc, r) => acc + r.amount_paise, 0) : null;
      };
      return { rentPaise: sum("RENT"), depositPaise: sum("DEPOSIT") };
    },
  });
}

/** Property-local "YYYY-MM-DD" (falls back to IST while the timezone loads). */
export function usePropertyToday(propertyId: string): string {
  const timezoneQ = usePropertyTimezone(propertyId || null);
  return localDateInTimezone(timezoneQ.data);
}

/** Integer paise → rupees text for a money input ("4500", "4500.50"); "" for null. */
export function paiseToRupeesText(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return "";
  const abs = Math.abs(Math.round(paise));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = paise < 0 ? "-" : "";
  return frac ? `${sign}${whole}.${String(frac).padStart(2, "0")}` : `${sign}${whole}`;
}

/** "₹1,23,456" (en-IN grouping); two decimals only when there are paise. */
export function formatRupees(paise: number): string {
  const hasPaise = Math.round(paise) % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Math.round(paise) / 100);
}
