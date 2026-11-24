import type { ScanStage } from "@ocrinvoice/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";
import { OcrError, readReceipt, readReceiptPages, readReceiptText, type OcrAnswer } from "./ocr-client.js";
import { extractPdfText, renderPagesAsPng } from "./pdf-render.js";
import { parseOcrAnswer } from "./ocr-reading.js";
import { readSourcePdf, readUpload } from "./uploads.js";

/** Readings waiting or running in this server process, so tests (and a graceful shutdown) can wait for them. */
const running = new Map<string, Promise<void>>();

/** CA-10.1: the real current stage of each active reading. */
const stages = new Map<string, ScanStage>();

/**
 * Readings are sent to the OCR service one at a time. llama.cpp shares one fixed working memory (its context)
 * between the requests it runs together: two phone photos at once overflowed it ("Context size has been exceeded",
 * 2026-11-15) and both readings failed. Queued readings simply wait their turn.
 */
let queue: Promise<void> = Promise.resolve();

/** Waits until the reading of one file has finished (resolves at once when it is not waiting or running). */
export async function waitForScan(fileId: string) {
  await running.get(fileId);
}

/** Whether this server process is still going to finish the reading (false after a restart interrupted it). */
export function isScanPending(fileId: string) {
  return running.has(fileId);
}

/** CA-10.1: returns the current stage of a pending scan, or null when not running. */
export function getScanStage(fileId: string): ScanStage | null {
  return stages.get(fileId) ?? (running.has(fileId) ? "READING" : null);
}

/** Updates the active stage of a scan. */
export function setScanStage(fileId: string, stage: ScanStage) {
  stages.set(fileId, stage);
}

/** Determines the active stage from the partial or complete OCR output. */
export function stageFromPartialOutput(partial: string): ScanStage {
  if (partial.includes('"items"')) {
    return "EXTRACTING_ITEMS";
  }
  if (partial.includes('"merchant"') || partial.includes('"date"') || partial.includes('"total"')) {
    return "EXTRACTING_FIELDS";
  }
  return "READING";
}

/**
 * CA-09.1 / CA-09.2 / CA-10.1: reads one uploaded photo with the OCR service, in the background, and stores the result.
 * The upload request does not wait for it (reading takes ~40 s); the app polls GET /api/scans/:id.
 */
export function startScan(fileId: string, today: string) {
  stages.set(fileId, "READING");
  const job = queue
    .then(() => processScan(fileId, today))
    .finally(() => {
      running.delete(fileId);
      stages.delete(fileId);
    });
  running.set(fileId, job);
  queue = job.catch(() => {});
}

async function processScan(fileId: string, today: string) {
  let rawOutput: string | null = null;
  let model: string | null = null;
  let durationMs: number | null = null;
  try {
    stages.set(fileId, "READING");
    const file = await prisma.file.findUniqueOrThrow({ where: { id: fileId } });
    const onProgress = (partialText: string) => {
      stages.set(fileId, stageFromPartialOutput(partialText));
    };
    const answer = await readUpload(file.storageKey).then((image) => readFile(file.storageKey, image, file.mimeType, onProgress));
    rawOutput = answer.raw;
    model = answer.model;
    durationMs = answer.durationMs;
    stages.set(fileId, "EXTRACTING_FIELDS");
    stages.set(fileId, "EXTRACTING_ITEMS");
    const reading = parseOcrAnswer(answer.raw, today);
    await prisma.ocrResult.update({
      where: { fileId },
      data: {
        status: "DONE",
        result: reading as unknown as Prisma.InputJsonValue,
        rawOutput,
        model,
        durationMs,
        errorCode: null,
      },
    });
  } catch (error) {
    const errorCode = error instanceof OcrError ? error.code : "OCR_UNAVAILABLE";
    if (!(error instanceof OcrError)) {
      console.error(`Scan ${fileId} failed`, error);
    }
    await prisma.ocrResult
      .update({ where: { fileId }, data: { status: "FAILED", errorCode, rawOutput, model, durationMs } })
      .catch((updateError) => console.error(`Could not record the failure of scan ${fileId}`, updateError));
  }
}

/**
 * US-09: reads an upload the best way for what it is:
 * - a PDF with real text (generated invoices): the text of ALL its pages, exactly;
 * - a PDF without text (a scanned paper document): a picture of each page (up to PDF_MAX_PAGES), read together;
 * - a photo, or a one-page PDF without text: the picture itself.
 */
async function readFile(
  storageKey: string,
  image: Uint8Array,
  mimeType: string,
  onProgress: (partialText: string) => void,
): Promise<OcrAnswer> {
  const pdf = await readSourcePdf(storageKey);
  if (pdf) {
    const text = extractPdfText(pdf);
    if (text) {
      return readReceiptText(text, onProgress);
    }
    const pages = renderPagesAsPng(pdf);
    if (pages.length > 1) {
      return readReceiptPages(
        pages.map((bytes) => ({ bytes, mimeType: "image/png" })),
        onProgress,
      );
    }
  }
  return readReceipt(image, mimeType, onProgress);
}
