import type { DocumentContext, ExpenseCategory, PaymentMethod } from "./expense.js";

/**
 * US-09: the automatic reading of a receipt photo. This is the contract between the server and the screens that
 * show the reading (US-10, progress and errors) and let the user check and save it (US-11).
 */

export const SCAN_STATUSES = ["PROCESSING", "DONE", "FAILED"] as const;

export type ScanStatus = (typeof SCAN_STATUSES)[number];

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

export type OcrItem = {
  name: OcrField<string>;
  quantity: OcrField<number>;
  /** The line's total, e.g. "12.38"; negative for a discount, e.g. "-3.20". */
  amount: OcrField<string>;
  category: OcrField<ExpenseCategory>;
};

export type OcrReading = {
  merchant: OcrField<string>;
  /** "2026-11-12" */
  date: OcrField<string>;
  /** "17:58" */
  time: OcrField<string>;
  /** "26.17" */
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
  uploadedAt: string;
  /** Present when status is DONE. */
  reading: OcrReading | null;
  /** Present when status is FAILED. */
  errorCode: ScanErrorCode | null;
};
