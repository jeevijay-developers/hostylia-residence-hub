/**
 * Shared by student.home.tsx (page content) and Topbar.tsx (fixed header
 * greeting) so both render the identical "Good Evening" text.
 */
export function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 21) return "Good Evening";
  return "Good Night";
}
