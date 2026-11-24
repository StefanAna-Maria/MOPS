import type { DocumentContext, ExpenseCategory, PaymentMethod } from "./expense.js";

/**
 * US-09: the automatic reading of a receipt photo. This is the contract between the server and the screens that
 * show the reading (US-10, progress and errors) and let the user check and save it (US-11).
 */

export const SCAN_STATUSES = ["PROCESSING", "DONE", "FAILED"] as const;

export type ScanStatus = (typeof SCAN_STATUSES)[number];

/**
 * CA-10.1: the real stages of reading a receipt, in order:
 * - UPLOADING: "Încărcăm documentul"
 * - READING: "Citim documentul"
 * - EXTRACTING_FIELDS: "Găsim magazinul, data și totalul"
 * - EXTRACTING_ITEMS: "Extragem produsele"
 */
export const SCAN_STAGES = [
  "UPLOADING",
  "READING",
  "EXTRACTING_FIELDS",
  "EXTRACTING_ITEMS",
] as const;

export type ScanStage = (typeof SCAN_STAGES)[number];

export const SCAN_STAGE_LABELS: Record<ScanStage, string> = {
  UPLOADING: "Încărcăm documentul",
  READING: "Citim documentul",
  EXTRACTING_FIELDS: "Găsim magazinul, data și totalul",
  EXTRACTING_ITEMS: "Extragem produsele",
};

/**
 * Why a reading failed:
 * - OCR_UNAVAILABLE: the OCR service (llama.cpp) is not running or not reachable;
 * - OCR_TIMEOUT: it took too long;
 * - UNREADABLE: the photo could not be read as a receipt.
 */
export const SCAN_ERROR_CODES = ["OCR_UNAVAILABLE", "OCR_TIMEOUT", "UNREADABLE"] as const;

export type ScanErrorCode = (typeof SCAN_ERROR_CODES)[number];

/** Values below this confidence should be checked by the user (CA-11.1). */
export const LOW_CONFIDENCE = 0.8;

export const MAX_SCAN_FILE_BYTES = 10 * 1024 * 1024;

export const SCAN_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** One value read from the receipt, with how sure the reading is (0-1). `value` is null when it was not found. */
export type OcrField<T> = {
  value: T | null;
  confidence: number;
};

/** A fiscal receipt (bon fiscal) or an invoice (factură). */
export const DOCUMENT_KINDS = ["RECEIPT", "INVOICE"] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  RECEIPT: "Bon fiscal",
  INVOICE: "Factură",
};

export type OcrItem = {
  name: OcrField<string>;
  quantity: OcrField<number>;
  /**
   * The line's total WITH VAT, e.g. "12.38"; negative for a discount, e.g. "-3.20". On an invoice this is
   * unitPrice × quantity + vatAmount.
   */
  amount: OcrField<string>;
  category: OcrField<ExpenseCategory>;
  /** Invoices only: the price of one unit WITHOUT VAT, e.g. "10.00". Absent on receipts. */
  unitPrice?: OcrField<string>;
  /** Invoices only: the VAT of the whole line, e.g. "6.30". Absent on receipts. */
  vatAmount?: OcrField<string>;
};

export type OcrReading = {
  /** Receipt or invoice. Readings made before invoices were supported have no value: treat them as RECEIPT. */
  documentKind?: DocumentKind;
  /** The seller: the store on a receipt, the supplier (furnizor) on an invoice — never the buyer. */
  merchant: OcrField<string>;
  /** "2026-11-12" */
  date: OcrField<string>;
  /** "17:58" */
  time: OcrField<string>;
  /** The amount to pay, WITH VAT, e.g. "26.17" (on an invoice: "Total de plată"; subtotal and VAT are not kept). */
  total: OcrField<string>;
  paymentMethod: OcrField<PaymentMethod>;
  items: OcrItem[];
  /** The sum of the items' amounts, e.g. "26.17". */
  itemsTotal: string;
  /** Whether the items add up to the total (to the ban). */
  totalMatches: boolean;
};

export type Scan = {
  id: string;
  context: DocumentContext;
  status: ScanStatus;
  /** Present when status is PROCESSING: the current real stage of reading (CA-10.1). */
  stage?: ScanStage | null;
  uploadedAt: string;
  /** Present when status is DONE. */
  reading: OcrReading | null;
  /** Present when status is FAILED. */
  errorCode: ScanErrorCode | null;
};
