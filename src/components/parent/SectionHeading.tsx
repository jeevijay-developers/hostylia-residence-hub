import type { ReactNode } from "react";

/** Small accent-bar heading used across Parent-portal list sections. */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded-full bg-primary" />
      {children}
    </h2>
  );
}
