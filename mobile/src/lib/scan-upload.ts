import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { DocumentContext, Scan } from "@ocrinvoice/shared";
import { apiFetch } from "./api";

/**
 * Photos are shrunk to at most this many pixels on their long side before upload. A real receipt read perfectly at
 * 656x2045; a full-resolution camera photo is several MB, slower to upload and slower for the model to read.
 */
export const MAX_SCAN_SIDE = 2048;

const UPLOAD_TIMEOUT = 60_000;

/** How often the reading screen asks the server whether the reading is done. */
export const POLL_INTERVAL_MS = 2000;

export class ScanUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Returns a JPEG of the photo no larger than MAX_SCAN_SIDE on its long side. */
export async function prepareScanImage(uri: string): Promise<string> {
  const probe = ImageManipulator.manipulate(uri);
  const original = await probe.renderAsync();
  const { width, height } = original;
  original.release?.();
  probe.release?.();

  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_SCAN_SIDE) {
    context.resize(height >= width ? { height: MAX_SCAN_SIDE } : { width: MAX_SCAN_SIDE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  rendered.release?.();
  context.release?.();
  return saved.uri;
}

/**
 * CA-09.1: uploads the receipt photo to the server, which starts reading it with the OCR service. Resolves with the
 * scan (status PROCESSING); poll GET /api/scans/:id for the result. Throws ScanUploadError, or a network error.
 */
export async function uploadScan(photoUri: string, context: DocumentContext): Promise<Scan> {
  const prepared = await prepareScanImage(photoUri);
  const form = new FormData();
  // Expo's fetch (SDK 58) only sends real Blobs; React Native's old { uri, name, type } object makes it throw
  // "Unsupported FormDataPart implementation". expo-file-system's File implements Blob.
  form.append("file", new File(prepared) as unknown as Blob, "receipt.jpg");
  form.append("context", context);

  const response = await apiFetch("/api/scans", { method: "POST", body: form }, { timeoutMs: UPLOAD_TIMEOUT });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ScanUploadError(typeof data?.code === "string" ? data.code : `HTTP_${response.status}`);
  }
  const data: { scan: Scan } = await response.json();
  return data.scan;
}

/** CA-09.2: the scan's current status and, once DONE, the reading. */
export async function fetchScan(id: string): Promise<Scan | null> {
  const response = await apiFetch(`/api/scans/${encodeURIComponent(id)}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new ScanUploadError(`HTTP_${response.status}`);
  }
  const data: { scan: Scan } = await response.json();
  return data.scan;
}

/** CA-10.2: retries reading an already-uploaded scan after an OCR error. */
export async function retryScan(id: string): Promise<Scan> {
  const response = await apiFetch(`/api/scans/${encodeURIComponent(id)}/retry`, { method: "POST" });
  if (response.status === 404) {
    throw new ScanUploadError("NOT_FOUND");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ScanUploadError(typeof data?.code === "string" ? data.code : `HTTP_${response.status}`);
  }
  const data: { scan: Scan } = await response.json();
  return data.scan;
}
