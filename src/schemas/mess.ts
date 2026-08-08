import { z } from "zod";

/**
 * Shared by the Warden "Publish Menu" form and "Edit Menu" dialog — one
 * mess_menus row per (property, menu_date, meal), so serveTime here becomes
 * that meal's own "Breakfast Time"/"Lunch Time"/etc.
 */
export const messMenuFormSchema = z.object({
  meal: z.enum(["BREAKFAST", "LUNCH", "SNACKS", "DINNER", "OTHER"]),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  menuDate: z.string().min(1, "Pick a date"),
  items: z.string().trim().min(1, "Add at least one item"),
  serveTime: z.string().optional().or(z.literal("")),
});

export type MessMenuFormInput = z.infer<typeof messMenuFormSchema>;

export const messHeadcountSchema = z.object({
  expectedCount: z.coerce.number().int().min(0),
  actualCount: z.coerce.number().int().min(0).optional(),
});

export type MessHeadcountInput = z.infer<typeof messHeadcountSchema>;
