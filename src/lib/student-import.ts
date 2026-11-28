import {
  MAX_STUDENT_AMOUNT_PAISE,
  PAYMENT_MODES_NEEDING_REFERENCE,
  rupeesTextToPaise,
  studentEmailKey,
  studentImportRowSchema,
  studentPhoneKey,
  type OfflinePaymentMode,
  type StudentImportRowInput,
} from "@/schemas/student";
import { normalizeIndianPhone } from "@/schemas/auth";

/** A bed named by an import row (room_number + bed_code), as found in the property. */
export interface ImportBed {
  bedId: string;
  roomNumber: string;
  code: string;
  status: string;
  roomStatus: string;
  /** beds.rent_override_paise, else rooms.base_rent_paise (same order as fn_admit_student). */
  rentPaise: number | null;
}

/** Everything a row resolves to beyond its raw cells: what admitStudentRow will be asked to do. */
export interface NormalizedImportRow {
  /** Upper-cased custom ID; "" means one is generated. */
  admissionNumber: string;
  gender: "" | "MALE" | "FEMALE" | "OTHER";
  initialStatus: "APPLICANT" | "VERIFIED";
  bed: ImportBed | null;
  duesPaise: number;
  payment: { amountPaise: number; mode: OfflinePaymentMode; reference: string } | null;
}

export type StudentImportDuplicateField = "phone" | "email" | "admission_number" | "bed";

export type StudentImportRow =
  | { row: number; status: "OK"; data: StudentImportRowInput; normalized: NormalizedImportRow }
  | { row: number; status: "INVALID"; error: string }
  | { row: number; status: "DUPLICATE"; error: string; fields: StudentImportDuplicateField[] };

/** What already exists in the tenant / property, looked up in batches before classifying. */
export interface ExistingStudentKeys {
  /** studentPhoneKey of live students in the tenant. */
  phones: Set<string>;
  /** studentEmailKey of live students in the tenant. */
  emails: Set<string>;
  /** Upper-cased admission numbers of live students in this property. */
  admissionNumbers: Set<string>;
  /** Beds of this property keyed by importBedKey(room_number, code). */
  beds: Map<string, ImportBed>;
}

export interface ClassifyOptions {
  /** A fee plan was chosen for the batch; rows that assign a bed need one. */
  hasFeePlan: boolean;
}

export function importBedKey(roomNumber: string, code: string): string {
  return `${roomNumber.trim()}|${code.trim()}`;
}

/** Values from rows that pass the schema, used to ask the database what already exists. */
export function collectImportLookups(rawRows: unknown[]): {
  phones: string[];
  emails: string[];
  admissionNumbers: string[];
  roomNumbers: string[];
} {
  const phones: string[] = [];
  const emails: string[] = [];
  const admissionNumbers = new Set<string>();
  const roomNumbers = new Set<string>();
  for (const raw of rawRows) {
    const parsed = studentImportRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const d = parsed.data;
    if (studentPhoneKey(d.phone)) phones.push(d.phone ?? "");
    if (studentEmailKey(d.email)) emails.push(d.email ?? "");
    const admission = (d.admission_number ?? "").trim().toUpperCase();
    if (admission) admissionNumbers.add(admission);
    const room = (d.room_number ?? "").trim();
    if (room) roomNumbers.add(room);
  }
  return { phones, emails, admissionNumbers: [...admissionNumbers], roomNumbers: [...roomNumbers] };
}

const GENDER_ALIASES: Record<string, NormalizedImportRow["gender"]> = {
  "": "",
  M: "MALE",
  MALE: "MALE",
  F: "FEMALE",
  FEMALE: "FEMALE",
  O: "OTHER",
  OTHER: "OTHER",
};

const VALID_PHONE = /^\+[1-9]\d{7,14}$/;

function isValidPhone(value: string): boolean {
  return VALID_PHONE.test(normalizeIndianPhone(value));
}

const RUPEES_LIMIT_LABEL = "₹1,00,00,000";

/** Schema-valid row -> cross-field problems (empty = OK) and its normalized plan. */
function checkRow(
  d: StudentImportRowInput,
  existing: ExistingStudentKeys,
  options: ClassifyOptions,
): { problems: string[]; normalized: NormalizedImportRow } {
  const problems: string[] = [];

  const gender = GENDER_ALIASES[(d.gender ?? "").trim().toUpperCase()];
  if (gender === undefined) problems.push("gender must be MALE, FEMALE or OTHER");

  if (d.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(d.date_of_birth.trim())) {
    problems.push("date_of_birth must be a date like 2007-04-12");
  }
  if (d.phone && !isValidPhone(d.phone)) problems.push("phone is not a valid mobile number");

  const guardianName = (d.guardian_name ?? "").trim();
  const guardianPhone = (d.guardian_phone ?? "").trim();
  if (Boolean(guardianName) !== Boolean(guardianPhone)) {
    problems.push("Enter both guardian_name and guardian_phone, or leave both blank");
  } else if (!guardianName && (d.guardian_relationship || d.guardian_email)) {
    problems.push("guardian_relationship and guardian_email need guardian_name and guardian_phone");
  }
  if (guardianName && guardianName.length < 2) {
    problems.push("guardian_name must be at least 2 characters");
  }
  if (guardianPhone && !isValidPhone(guardianPhone)) {
    problems.push("guardian_phone is not a valid mobile number");
  }

  // Room + bed -> an allocation awaiting the student's agreement.
  let bed: ImportBed | null = null;
  const room = (d.room_number ?? "").trim();
  const code = (d.bed_code ?? "").trim();
  if (Boolean(room) !== Boolean(code)) {
    problems.push("Enter both room_number and bed_code to assign a bed, or leave both blank");
  } else if (room) {
    const found = existing.beds.get(importBedKey(room, code));
    if (!options.hasFeePlan) problems.push("Choose a fee plan in the import dialog to assign beds");
    if (!found) {
      problems.push(`Bed ${code} in room ${room} was not found in this property`);
    } else if (found.roomStatus !== "ACTIVE") {
      problems.push(`Room ${room} is not active (${found.roomStatus.toLowerCase()})`);
    } else if (found.status !== "VACANT") {
      problems.push(`Bed ${code} in room ${room} is not vacant (${found.status.toLowerCase()})`);
    } else {
      bed = found;
    }
  }

  // Opening dues (+ optional offline payment), integer paise.
  const duesPaise = rupeesTextToPaise(d.opening_dues_rupees);
  const paidPaise = rupeesTextToPaise(d.paid_rupees);
  if (duesPaise > MAX_STUDENT_AMOUNT_PAISE) {
    problems.push(`opening_dues_rupees can be at most ${RUPEES_LIMIT_LABEL}`);
  }
  let payment: NormalizedImportRow["payment"] = null;
  if (paidPaise > 0) {
    const mode = d.payment_mode || null;
    const reference = (d.payment_reference ?? "").trim();
    if (duesPaise === 0) problems.push("paid_rupees needs opening_dues_rupees");
    else if (paidPaise > duesPaise) {
      problems.push("paid_rupees can't be more than opening_dues_rupees");
    }
    if (!mode) {
      problems.push(
        "payment_mode is required with paid_rupees (CASH, UPI, BANK_TRANSFER or OTHER)",
      );
    } else if (mode === "CHEQUE") {
      // The file has no cheque-date column and record_manual_payment needs one.
      problems.push("Cheque payments can't be imported: import the dues, then record the cheque");
    } else {
      if (PAYMENT_MODES_NEEDING_REFERENCE.includes(mode) && !reference) {
        problems.push(`payment_reference is required for ${mode.replace("_", " ")} payments`);
      }
      payment = { amountPaise: paidPaise, mode, reference };
    }
  }
  // A money row must be recognisable on a re-upload, or importing the file twice bills twice.
  if (duesPaise > 0 && !d.phone && !d.email && !d.admission_number) {
    problems.push("Rows with opening dues need a phone, email or admission_number");
  }

  return {
    problems,
    normalized: {
      admissionNumber: (d.admission_number ?? "").trim().toUpperCase(),
      gender: gender ?? "",
      initialStatus: d.status === "VERIFIED" ? "VERIFIED" : "APPLICANT",
      bed,
      duesPaise,
      payment,
    },
  };
}

/**
 * Classifies every uploaded row as importable, invalid, or a duplicate — of an existing student
 * (phone / email tenant-wide, admission ID in this property) or of an EARLIER importable row in
 * the same file (first one wins; a bed can only be claimed once). A skipped row never "claims" its
 * keys, so a later row is only a duplicate of something that will really be inserted. Guardian
 * contact numbers are never compared, so one parent can have many students.
 */
export function classifyStudentRows(
  rawRows: unknown[],
  existing: ExistingStudentKeys,
  options: ClassifyOptions = { hasFeePlan: false },
): StudentImportRow[] {
  const seenPhone = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  const seenAdmission = new Map<string, number>();
  const seenBed = new Map<string, number>();

  return rawRows.map((raw, i): StudentImportRow => {
    const row = i + 1;
    const parsed = studentImportRowSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        row,
        status: "INVALID",
        error: parsed.error.issues
          .map((x) => (x.path.length ? `${x.path.join(".")}: ${x.message}` : x.message))
          .join("; "),
      };
    }
    const { problems, normalized } = checkRow(parsed.data, existing, options);
    if (problems.length > 0) return { row, status: "INVALID", error: problems.join("; ") };

    const phoneKey = studentPhoneKey(parsed.data.phone);
    const emailKey = studentEmailKey(parsed.data.email);
    const admissionKey = normalized.admissionNumber || null;
    const bedKey = normalized.bed
      ? importBedKey(normalized.bed.roomNumber, normalized.bed.code)
      : null;

    const reasons: string[] = [];
    const fields: StudentImportDuplicateField[] = [];
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
    if (admissionKey) {
      if (existing.admissionNumbers.has(admissionKey)) {
        reasons.push("Duplicate admission ID: already used in this property");
        fields.push("admission_number");
      } else if (seenAdmission.has(admissionKey)) {
        reasons.push(
          `Duplicate admission ID: same as row ${seenAdmission.get(admissionKey)} in this file`,
        );
        fields.push("admission_number");
      }
    }
    if (bedKey && seenBed.has(bedKey)) {
      reasons.push(`Duplicate bed: already assigned to row ${seenBed.get(bedKey)} in this file`);
      fields.push("bed");
    }
    if (reasons.length > 0) return { row, status: "DUPLICATE", error: reasons.join("; "), fields };

    if (phoneKey) seenPhone.set(phoneKey, row);
    if (emailKey) seenEmail.set(emailKey, row);
    if (admissionKey) seenAdmission.set(admissionKey, row);
    if (bedKey) seenBed.set(bedKey, row);
    return { row, status: "OK", data: parsed.data, normalized };
  });
}
