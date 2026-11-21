import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { requireSession, type SessionVariables } from "../lib/session.js";
import { resolveContext } from "../lib/context.js";
import { detectImageType, readUpload, saveUpload, storageKeyFor } from "../lib/uploads.js";
import { isPdf, renderFirstPageAsPng } from "../lib/pdf-render.js";
import { getScanStage, isScanPending, startScan } from "../lib/scan-processor.js";
import { documentWithLines, requestTimeZone, serializeDocument, utcDate } from "./documents.js";
import {
  MAX_SCAN_FILE_BYTES,
  timeInTimeZone,
  todayInTimeZone,
  validateScannedDocument,
  type OcrReading,
  type Scan,
  type ScanErrorCode,
  type ScanStatus,
} from "@ocrinvoice/shared";

const scans = new Hono<{ Variables: SessionVariables }>();

scans.use("*", requireSession);

/**
 * A reading still "PROCESSING" that this server is no longer going to finish (it is not in the queue, e.g. the
 * server restarted while reading) counts as failed. The grace period covers an upload that is just being queued.
 */
const INTERRUPTED_AFTER_MS = 60_000;

function isInterrupted(file: { id: string; uploadedAt: Date }) {
  return !isScanPending(file.id) && Date.now() - file.uploadedAt.getTime() > INTERRUPTED_AFTER_MS;
}

type FileWithResult = {
  id: string;
  companyId: string | null;
  uploadedAt: Date;
  ocrResult: { status: string; result: unknown; errorCode: string | null; updatedAt: Date } | null;
};

function serializeScan(file: FileWithResult): Scan {
  const result = file.ocrResult;
  let status = (result?.status ?? "FAILED") as ScanStatus;
  let errorCode = (result?.errorCode ?? null) as ScanErrorCode | null;
  if (status === "PROCESSING" && isInterrupted(file)) {
    status = "FAILED";
    errorCode = "OCR_TIMEOUT";
  }
  return {
    id: file.id,
    context: file.companyId ? "company" : "personal",
    status,
    stage: status === "PROCESSING" ? (getScanStage(file.id) ?? "READING") : null,
    uploadedAt: file.uploadedAt.toISOString(),
    reading: status === "DONE" ? (result?.result as OcrReading) : null,
    errorCode: status === "FAILED" ? (errorCode ?? "OCR_UNAVAILABLE") : null,
  };
}

/** The app (Expo's fetch) sends file names percent-encoded ("Factura%20nr%201.pdf"); this gives the real name back. */
function readableName(name: string) {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

const withResult = { ocrResult: { select: { status: true, result: true, errorCode: true, updatedAt: true } } };

// CA-09.1: the app uploads the photo (multipart/form-data: "file", optional "context"); the server stores it and
// starts reading it with the OCR service in the background. Answers 202 at once; poll GET /api/scans/:id.
scans.post(
  "/",
  // Reject oversized uploads while they arrive, before reading them into memory (+64 KB for the form fields).
  bodyLimit({ maxSize: MAX_SCAN_FILE_BYTES + 64 * 1024, onError: (c) => c.json({ code: "FILE_TOO_LARGE" }, 413) }),
  async (c) => {
    const user = c.get("user");
    const form = await c.req.parseBody().catch(() => null);
    const file = form?.file;

    if (!(file instanceof File)) {
      return c.json({ code: "FILE_REQUIRED" }, 400);
    }
    if (file.size === 0 || file.size > MAX_SCAN_FILE_BYTES) {
      return c.json({ code: "FILE_TOO_LARGE" }, 413);
    }
    // The type is taken from the image's own bytes, not from what the phone declares (Expo's fetch, React Native
    // and browsers label uploads differently, and the label can be anything).
    let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
    let mimeType = detectImageType(bytes);
    // US-14 (CA-14.2): a PDF becomes a picture of its first page, so it is read exactly like a photo.
    if (!mimeType && isPdf(bytes)) {
      try {
        bytes = renderFirstPageAsPng(bytes);
        mimeType = "image/png";
      } catch (error) {
        console.warn("Could not read the uploaded PDF:", error instanceof Error ? error.message : error);
        return c.json({ code: "UNREADABLE_PDF" }, 422);
      }
    }
    if (!mimeType) {
      return c.json({ code: "UNSUPPORTED_FILE_TYPE" }, 415);
    }

    const context = await resolveContext(user.id, form?.context);
    if (!context.ok) {
      return c.json({ code: context.code }, context.status);
    }

    const id = randomUUID().replace(/-/g, "");
    const storageKey = storageKeyFor(user.id, id, mimeType);
    await saveUpload(storageKey, bytes);

    const created = await prisma.file.create({
      data: {
        id,
        userId: user.id,
        companyId: context.companyId,
        originalName: readableName(file.name || "receipt").slice(0, 200),
        mimeType,
        size: bytes.length,
        storageKey,
        ocrResult: { create: { status: "PROCESSING" } },
      },
      include: withResult,
    });

    startScan(created.id, todayInTimeZone(requestTimeZone(c.req.header("X-Time-Zone"))));

    return c.json({ scan: serializeScan(created) }, 202);
  },
);

// CA-09.2 / CA-10.1: the reading's status, current stage, and, once DONE, the values read with their confidence.
scans.get("/:id", async (c) => {
  const user = c.get("user");
  const file = await prisma.file.findFirst({ where: { id: c.req.param("id"), userId: user.id }, include: withResult });
  if (!file) {
    return c.json({ code: "SCAN_NOT_FOUND" }, 404);
  }
  return c.json({ scan: serializeScan(file) });
});

// CA-10.2: retries reading an already-uploaded photo when the OCR service was stopped or timed out.
scans.post("/:id/retry", async (c) => {
  const user = c.get("user");
  const file = await prisma.file.findFirst({ where: { id: c.req.param("id"), userId: user.id }, include: withResult });
  if (!file) {
    return c.json({ code: "SCAN_NOT_FOUND" }, 404);
  }
  const bytes = await readUpload(file.storageKey).catch(() => null);
  if (!bytes) {
    return c.json({ code: "SCAN_NOT_FOUND" }, 404);
  }

  if (!isScanPending(file.id)) {
    const updated = await prisma.file.update({
      where: { id: file.id },
      data: {
        uploadedAt: new Date(),
        ocrResult: {
          upsert: {
            create: { status: "PROCESSING" },
            update: { status: "PROCESSING", result: Prisma.DbNull, errorCode: null },
          },
        },
      },
      include: withResult,
    });
    startScan(updated.id, todayInTimeZone(requestTimeZone(c.req.header("X-Time-Zone"))));
    return c.json({ scan: serializeScan(updated) }, 202);
  }

  return c.json({ scan: serializeScan(file) }, 202);
});

// The uploaded photo itself (for showing it next to the reading, and attached to the saved document in US-11).
scans.get("/:id/image", async (c) => {
  const user = c.get("user");
  const file = await prisma.file.findFirst({ where: { id: c.req.param("id"), userId: user.id } });
  if (!file) {
    return c.json({ code: "SCAN_NOT_FOUND" }, 404);
  }
  const bytes = await readUpload(file.storageKey).catch(() => null);
  if (!bytes) {
    return c.json({ code: "SCAN_NOT_FOUND" }, 404);
  }
  return c.body(new Uint8Array(bytes), 200, {
    "Content-Type": file.mimeType,
    "Cache-Control": "private, max-age=3600",
  });
});

// CA-11.3 / CA-11.4: saves the values checked by the user as a scanned document, with the photo attached. The
// products must add up to the total. A photo becomes a single document: saving it again returns that document.
scans.post("/:id/document", async (c) => {
  const user = c.get("user");
  const file = await prisma.file.findFirst({
    where: { id: c.req.param("id"), userId: user.id },
    include: { ocrResult: { select: { status: true } }, document: { include: documentWithLines } },
  });
  if (!file) {
    return c.json({ code: "SCAN_NOT_FOUND" }, 404);
  }
  if (file.document) {
    return c.json({ document: serializeDocument(file.document) }, 200);
  }
  if (file.ocrResult?.status !== "DONE") {
    return c.json({ code: "SCAN_NOT_READY" }, 409);
  }

  const body = await c.req.json().catch(() => null);
  const timeZone = requestTimeZone(c.req.header("X-Time-Zone"));
  const result = validateScannedDocument(body, todayInTimeZone(timeZone), timeInTimeZone(timeZone));
  if (!result.ok) {
    return c.json({ code: "INVALID_DOCUMENT", fields: result.fields }, 400);
  }

  const values = result.value;
  try {
    const created = await prisma.document.create({
      data: {
        userId: user.id,
        companyId: file.companyId,
        type: "SCANNED",
        merchant: values.merchant,
        date: utcDate(values.date),
        time: values.time,
        total: values.total,
        category: values.category,
        paymentMethod: values.paymentMethod,
        note: null,
        clientRequestId: `scan-${file.id}`,
        fileId: file.id,
        lines: {
          create: values.items.map((item, index) => ({
            position: index + 1,
            name: item.name,
            amount: item.amount,
            category: item.category,
          })),
        },
      },
      include: documentWithLines,
    });
    return c.json({ document: serializeDocument(created) }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const saved = await prisma.document.findUnique({ where: { fileId: file.id }, include: documentWithLines });
      if (saved) {
        return c.json({ document: serializeDocument(saved) }, 200);
      }
    }
    throw error;
  }
});

export default scans;
