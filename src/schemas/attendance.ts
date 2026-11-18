import { z } from "zod";

// One row of attendance_room_counts(): an occupied room and how many eligible
// (ACTIVE, non-deleted) students hold an ACTIVE allocation in it.
export const attendanceRoomCountSchema = z.object({
  room_id: z.string().uuid(),
  room_number: z.string(),
  student_count: z.number().int().nonnegative(),
});
export type AttendanceRoomCount = z.infer<typeof attendanceRoomCountSchema>;
