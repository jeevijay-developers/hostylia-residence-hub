import {
  studentBulkRowSchema,
  studentEmailKey,
  studentPhoneKey,
  type StudentBulkRow,
} from "@/schemas/student";

export type StudentImportRow =
  | { row: number; status: "OK"; data: StudentBulkRow }
  | { row: number; status: "INVALID"; error: string }
  | { row: number; status: "DUPLICATE"; error: string; fields: ("phone" | "email")[] };

/** Keys (see studentPhoneKey / studentEmailKey) of students that already exist in the tenant. */
export interface ExistingStudentKeys {
  phones: Set<string>;
  emails: Set<string>;
}

/** Validated rows' raw phone / email values, used to ask the database which already exist. */
export function collectIdentityValues(rawRows: unknown[]): { phones: string[]; emails: string[] } {
  const phones: string[] = [];
  const emails: string[] = [];
  for (const raw of rawRows) {
    const parsed = studentBulkRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (studentPhoneKey(parsed.data.phone)) phones.push(parsed.data.phone ?? "");
    if (studentEmailKey(parsed.data.email)) emails.push(parsed.data.email ?? "");
  }
  return { phones, emails };
}

/**
 * Classifies every uploaded row as importable, invalid, or a duplicate — of an
 * existing student or of an EARLIER importable row in the same file (first one
 * wins). A skipped row never "claims" its phone/email, so a later row is only a
 * duplicate of something that will really be inserted. Guardian contact numbers
 * are never compared, so one parent can have many students.
 */
export function classifyStudentRows(
  rawRows: unknown[],
  existing: ExistingStudentKeys,
): StudentImportRow[] {
  const seenPhone = new Map<string, number>();
  const seenEmail = new Map<string, number>();

  return rawRows.map((raw, i): StudentImportRow => {
    const row = i + 1;
    const parsed = studentBulkRowSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        row,
        status: "INVALID",
        error: parsed.error.issues.map((x) => x.message).join("; "),
      };
    }
    const phoneKey = studentPhoneKey(parsed.data.phone);
    const emailKey = studentEmailKey(parsed.data.email);

    const reasons: string[] = [];
    const fields: ("phone" | "email")[] = [];
    if (phoneKey) {
      if (existing.phones.has(phoneKey)) {
        reasons.push("Duplicate phone: a student with this phone number is already registered");
        fields.push("phone");
      } else if (seenPhone.has(phoneKey)) {
        reasons.push(`Duplicate phone: same number as row ${seenPhone.get(phoneKey)} in this file`);
        fields.push("phone");
      }
    }
    if (emailKey) {
      if (existing.emails.has(emailKey)) {
        reasons.push("Duplicate email: a student with this email is already registered");
        fields.push("email");
      } else if (seenEmail.has(emailKey)) {
        reasons.push(`Duplicate email: same email as row ${seenEmail.get(emailKey)} in this file`);
        fields.push("email");
      }
    }
    if (reasons.length > 0) return { row, status: "DUPLICATE", error: reasons.join("; "), fields };

    if (phoneKey) seenPhone.set(phoneKey, row);
    if (emailKey) seenEmail.set(emailKey, row);
    return { row, status: "OK", data: parsed.data };
  });
}
