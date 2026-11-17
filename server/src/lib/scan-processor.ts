import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";
import { OcrError, readReceipt } from "./ocr-client.js";
import { parseOcrAnswer } from "./ocr-reading.js";
import { readUpload } from "./uploads.js";

/** Readings waiting or running in this server process, so tests (and a graceful shutdown) can wait for them. */
const running = new Map<string, Promise<void>>();

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

/**
 * CA-09.1 / CA-09.2: reads one uploaded photo with the OCR service, in the background, and stores the result.
 * The upload request does not wait for it (reading takes ~40 s); the app polls GET /api/scans/:id.
 */
export function startScan(fileId: string, today: string) {
  const job = queue.then(() => processScan(fileId, today)).finally(() => running.delete(fileId));
  running.set(fileId, job);
  queue = job.catch(() => {});
}

async function processScan(fileId: string, today: string) {
  let rawOutput: string | null = null;
  let model: string | null = null;
  let durationMs: number | null = null;
  try {
    const file = await prisma.file.findUniqueOrThrow({ where: { id: fileId } });
    const image = await readUpload(file.storageKey);
    const answer = await readReceipt(image, file.mimeType);
    rawOutput = answer.raw;
    model = answer.model;
    durationMs = answer.durationMs;
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
