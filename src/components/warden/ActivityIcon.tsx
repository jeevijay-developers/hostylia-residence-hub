import { Activity, CalendarCheck, DoorOpen, MessageSquareWarning, Utensils } from "lucide-react";

export function ActivityIcon({ type }: { type: string }) {
  const Icon =
    type === "Gate Pass Approved"
      ? DoorOpen
      : type === "Menu Published"
        ? Utensils
        : type === "Attendance Submitted"
          ? CalendarCheck
          : type.startsWith("Complaint")
            ? MessageSquareWarning
            : Activity;
  return (
    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}
