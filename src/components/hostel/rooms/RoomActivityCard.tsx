import { Activity } from "lucide-react";

import { ActivityTimelineCard } from "@/components/dashboard/ActivityTimelineCard";
import type { ActivityItem } from "@/lib/room-activity";

/**
 * The room's recent history. Shows as many items as fit beside the Beds card
 * (4 when it has one row of beds, more when it has two); "View all" opens
 * the full list in a dialog.
 */
export function RoomActivityCard({
  items,
  isLoading,
  isError,
}: {
  items: ActivityItem[];
  isLoading?: boolean;
  isError?: boolean;
}) {
  return (
    <ActivityTimelineCard
      title="Recent room activity"
      icon={Activity}
      items={items}
      isLoading={isLoading}
      isError={isError}
      errorText="Couldn’t load this room’s activity. Please refresh to try again."
      emptyText="Pick a room to see its activity."
    />
  );
}
