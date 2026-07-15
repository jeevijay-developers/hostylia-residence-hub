import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PropertyState {
  /** Currently selected property id for admin-scoped views (Hostel Admin). */
  activePropertyId: string | null;
  setActivePropertyId: (id: string | null) => void;
}

/**
 * Cross-screen client-only state per Architecture.md Sec 7.3 —
 * "active property" selection persists across navigation without refetching.
 */
export const usePropertyStore = create<PropertyState>()(
  persist(
    (set) => ({
      activePropertyId: null,
      setActivePropertyId: (id) => set({ activePropertyId: id }),
    }),
    { name: "hostylia.active-property" },
  ),
);
