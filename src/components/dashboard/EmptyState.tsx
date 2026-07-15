import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick?: () => void };
  children?: ReactNode;
}

/**
 * Signature "tower motif" empty state per Design.md Sec 5 — a faded, outlined
 * Hostylia column/building mark above a message and optional CTA.
 */
export function EmptyState({ title, description, action, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <TowerMark className="mb-6 h-20 w-20 text-primary/25" />
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? (
        <Button className="mt-6 min-h-11" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
      {children}
    </div>
  );
}

function TowerMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 80"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M32 4 L56 18 V72 H8 V18 Z" />
      <path d="M20 32 H28 V44 H20 Z" />
      <path d="M36 32 H44 V44 H36 Z" />
      <path d="M20 52 H28 V64 H20 Z" />
      <path d="M36 52 H44 V72" />
      <path d="M32 4 V18" />
    </svg>
  );
}
