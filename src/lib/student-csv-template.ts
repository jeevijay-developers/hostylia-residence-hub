import { toCsv, type CsvColumn } from "@/lib/csv";

/**
 * Sample file for the student bulk import. The columns are exactly what the importer reads
 * (studentImportRowSchema), in the documented order. Only full_name is required; a bed needs both
 * room_number and bed_code (plus a fee plan picked in the dialog), and paid_rupees needs
 * opening_dues_rupees. Rent and deposit are billed automatically after the agreement is signed, so
 * opening dues are only for admission fees, back-dues and other one-off charges.
 */
export interface StudentCsvSampleRow extends Record<string, unknown> {
  full_name: string;
  admission_number: string;
  phone: string;
  email: string;
  date_of_birth: string;
  gender: string;
  academic_institute: string;
  course_name: string;
  academic_year: string;
  status: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_relationship: string;
  guardian_email: string;
  room_number: string;
  bed_code: string;
  start_date: string;
  opening_dues_rupees: string;
  paid_rupees: string;
  payment_mode: string;
  payment_reference: string;
}

const COLUMN_KEYS: (keyof StudentCsvSampleRow & string)[] = [
  "full_name",
  "admission_number",
  "phone",
  "email",
  "date_of_birth",
  "gender",
  "academic_institute",
  "course_name",
  "academic_year",
  "status",
  "guardian_name",
  "guardian_phone",
  "guardian_relationship",
  "guardian_email",
  "room_number",
  "bed_code",
  "start_date",
  "opening_dues_rupees",
  "paid_rupees",
  "payment_mode",
  "payment_reference",
];

export const STUDENT_CSV_COLUMNS: CsvColumn<StudentCsvSampleRow>[] = COLUMN_KEYS.map((key) => ({
  key,
  label: key,
}));

export const STUDENT_CSV_REQUIRED_HEADERS: string[] = ["full_name"];

export const STUDENT_CSV_SAMPLE_ROWS: StudentCsvSampleRow[] = [
  // Verified student placed in a bed, with an admission fee paid by UPI. The institute contains a
  // comma, so the cell is quoted in the file.
  {
    full_name: "Aarav Sharma",
    admission_number: "KOTA-2026-001",
    phone: "9876543210",
    email: "aarav.sharma@example.com",
    date_of_birth: "2008-04-12",
    gender: "MALE",
    academic_institute: "Allen Career Institute, Kota",
    course_name: "JEE Main + Advanced",
    academic_year: "2026-27",
    status: "VERIFIED",
    guardian_name: "Rajesh Sharma",
    guardian_phone: "9812345678",
    guardian_relationship: "Father",
    guardian_email: "rajesh.sharma@example.com",
    room_number: "A-101",
    bed_code: "A",
    start_date: "2026-12-01",
    opening_dues_rupees: "5000",
    paid_rupees: "5000",
    payment_mode: "UPI",
    payment_reference: "UTR402612345678",
  },
  // Applicant with no bed yet: the admission ID is generated and nothing is billed.
  {
    full_name: "Priya Verma",
    admission_number: "",
    phone: "9123456780",
    email: "",
    date_of_birth: "2009-09-30",
    gender: "FEMALE",
    academic_institute: "Resonance",
    course_name: "NEET",
    academic_year: "2026-27",
    status: "APPLICANT",
    guardian_name: "Sunita Verma",
    guardian_phone: "9988776655",
    guardian_relationship: "Mother",
    guardian_email: "",
    room_number: "",
    bed_code: "",
    start_date: "",
    opening_dues_rupees: "",
    paid_rupees: "",
    payment_mode: "",
    payment_reference: "",
  },
];

export const STUDENT_CSV_FILENAME = "students-import-template.csv";

export function buildStudentTemplateCsv(): string {
  return toCsv(STUDENT_CSV_SAMPLE_ROWS, STUDENT_CSV_COLUMNS) + "\n";
}
