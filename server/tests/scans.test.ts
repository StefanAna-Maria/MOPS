import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index.js";
import { prisma } from "../src/lib/prisma.js";
import { OcrError, readReceipt, readReceiptPages, readReceiptText } from "../src/lib/ocr-client.js";
import { stageFromPartialOutput, waitForScan } from "../src/lib/scan-processor.js";
import { detectImageType } from "../src/lib/uploads.js";
import { createSignedInUser, get, resetDatabase, send } from "./helpers.js";
import { makePdf, pngSize } from "./pdf-fixture.js";

vi.mock("../src/lib/ocr-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/ocr-client.js")>();
  return { ...actual, readReceipt: vi.fn(), readReceiptText: vi.fn(), readReceiptPages: vi.fn() };
});

const readReceiptMock = vi.mocked(readReceipt);

// The smallest valid JPEG header is enough: the OCR service is replaced by the mock above.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

const CARREFOUR_ANSWER = JSON.stringify({
  merchant: { value: "Carrefour express", confidence: 0.98 },
  date: { value: "2026-11-12", confidence: 0.98 },
  time: { value: "17:58", confidence: 0.98 },
  total: { value: 26.17, confidence: 0.98 },
  paymentMethod: { value: "CARD", confidence: 0.98 },
  items: [
    { name: { value: "PARTY MIX", confidence: 0.95 }, quantity: { value: 2, confidence: 0.95 }, amount: { value: 29.37, confidence: 0.95 }, category: { value: "GROCERIES", confidence: 0.95 } },
    { name: { value: "DISCOUNT", confidence: 0.95 }, quantity: { value: 1, confidence: 0.95 }, amount: { value: -3.2, confidence: 0.95 }, category: { value: "GROCERIES", confidence: 0.95 } },
  ],
});

function upload(
  cookie: string | undefined,
  options: { bytes?: Uint8Array; type?: string; name?: string; context?: string; omitFile?: boolean } = {},
) {
  const form = new FormData();
  if (!options.omitFile) {
    form.append(
      "file",
      new File([options.bytes ?? JPEG], options.name ?? "receipt.jpg", { type: options.type ?? "image/jpeg" }),
    );
  }
  if (options.context) {
    form.append("context", options.context);
  }
  return app.request("/api/scans", {
    method: "POST",
    headers: { Origin: "http://localhost:3000", "X-Time-Zone": "Europe/Bucharest", ...(cookie ? { Cookie: cookie } : {}) },
    body: form,
  });
}

async function uploadAndRead(cookie: string, options: Parameters<typeof upload>[1] = {}) {
  const response = await upload(cookie, options);
  const { scan } = await response.json();
  await waitForScan(scan.id);
  const after = await (await get(`/api/scans/${scan.id}`, { cookie })).json();
  return { uploadResponse: response, uploaded: scan, scan: after.scan };
}

/**
 * An OCR answer the test releases when it wants. Readings run one at a time, so one that never finished would block
 * every later test: afterEach releases whatever is still waiting.
 */
const pendingAnswers: (() => void)[] = [];

function slowOcr() {
  let release: () => void = () => {};
  const answer = new Promise<Awaited<ReturnType<typeof readReceipt>>>((resolve) => {
    release = () => resolve({ raw: CARREFOUR_ANSWER, model: "qwen3-vl-4b", durationMs: 31000 });
  });
  pendingAnswers.push(release);
  return { answer, release };
}

beforeEach(async () => {
  await resetDatabase();
  readReceiptMock.mockReset();
  readReceiptMock.mockResolvedValue({ raw: CARREFOUR_ANSWER, model: "qwen3-vl-4b", durationMs: 31000 });
});

afterEach(async () => {
  pendingAnswers.splice(0).forEach((release) => release());
  await new Promise((resolve) => setTimeout(resolve, 50));
});

describe("POST /api/scans", () => {
  it("returns 401 without a session", async () => {
    expect((await upload(undefined)).status).toBe(401);
  });

  it("CA-09.1: stores the photo and answers at once with PROCESSING", async () => {
    const { answer } = slowOcr();
    readReceiptMock.mockImplementation(() => answer);
    const { cookie } = await createSignedInUser();

    const response = await upload(cookie, { context: "personal" });

    expect(response.status).toBe(202);
    const { scan } = await response.json();
    expect(scan).toMatchObject({ status: "PROCESSING", context: "personal", reading: null, errorCode: null });
    const file = await prisma.file.findUniqueOrThrow({ where: { id: scan.id } });
    expect(file).toMatchObject({ mimeType: "image/jpeg", size: JPEG.length, originalName: "receipt.jpg" });
  });

  it("CA-09.1: sends the uploaded photo to the OCR service", async () => {
    const { cookie } = await createSignedInUser();

    await uploadAndRead(cookie);

    expect(readReceiptMock).toHaveBeenCalledTimes(1);
    const [bytes, mimeType] = readReceiptMock.mock.calls[0];
    expect(Array.from(bytes)).toEqual(Array.from(JPEG));
    expect(mimeType).toBe("image/jpeg");
  });

  it.each([
    ["no file", { omitFile: true }, 400, "FILE_REQUIRED"],
    ["a PDF that cannot be opened", { bytes: new TextEncoder().encode("%PDF-1.7 ..."), type: "application/pdf", name: "bon.pdf" }, 422, "UNREADABLE_PDF"],
    ["a text file", { bytes: new TextEncoder().encode("hello"), type: "text/plain", name: "notite.txt" }, 415, "UNSUPPORTED_FILE_TYPE"],
    ["text pretending to be a JPEG", { bytes: new TextEncoder().encode("not an image"), type: "image/jpeg" }, 415, "UNSUPPORTED_FILE_TYPE"],
    ["an empty file", { bytes: new Uint8Array() }, 413, "FILE_TOO_LARGE"],
    ["a file over 10 MB", { bytes: new Uint8Array(10 * 1024 * 1024 + 1) }, 413, "FILE_TOO_LARGE"],
  ])("refuses %s", async (_case, options, status, code) => {
    const { cookie } = await createSignedInUser();

    const response = await upload(cookie, options);

    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
    expect(await prisma.file.count()).toBe(0);
    expect(readReceiptMock).not.toHaveBeenCalled();
  });

  it("saves the scan in the company profile, and refuses it for a user without a company", async () => {
    const withCompany = await createSignedInUser();
    await send("POST", "/api/company", { cui: "RO 14399840", name: "Exemplu SRL", address: "Str. 1" }, {
      cookie: withCompany.cookie,
    });
    const withoutCompany = await createSignedInUser();

    const saved = await upload(withCompany.cookie, { context: "company" });
    const refused = await upload(withoutCompany.cookie, { context: "company" });

    expect((await saved.json()).scan.context).toBe("company");
    expect(refused.status).toBe(404);
    expect((await refused.json()).code).toBe("COMPANY_NOT_FOUND");
  });

  it("identifies the image from its bytes, whatever type the phone declares", async () => {
    const { cookie } = await createSignedInUser();

    const response = await upload(cookie, { type: "application/octet-stream", name: "a1b2c3.jpg" });

    expect(response.status).toBe(202);
    const { scan } = await response.json();
    const file = await prisma.file.findUniqueOrThrow({ where: { id: scan.id } });
    expect(file.mimeType).toBe("image/jpeg");
    expect(file.storageKey).toMatch(/\.jpg$/);
  });
});

describe("POST /api/scans with a PDF (US-14)", () => {
  it("CA-14.1: accepts a PDF", async () => {
    const { cookie } = await createSignedInUser();

    const response = await upload(cookie, { bytes: makePdf(), type: "application/pdf", name: "factura.pdf" });

    expect(response.status).toBe(202);
  });

  it("CA-14.1: accepts a PDF whatever type the phone declares", async () => {
    const { cookie } = await createSignedInUser();

    const response = await upload(cookie, { bytes: makePdf(), type: "application/octet-stream", name: "document" });

    expect(response.status).toBe(202);
  });

  it("CA-14.2: keeps the first page as a PNG picture and the PDF's name", async () => {
    const { cookie } = await createSignedInUser();

    const response = await upload(cookie, { bytes: makePdf(), type: "application/pdf", name: "factura.pdf" });

    const { scan } = await response.json();
    const file = await prisma.file.findUniqueOrThrow({ where: { id: scan.id } });
    expect(file).toMatchObject({ mimeType: "image/png", originalName: "factura.pdf" });
    expect(file.storageKey).toMatch(/\.png$/);
    const image = await get(`/api/scans/${scan.id}/image`, { cookie });
    expect(image.headers.get("Content-Type")).toBe("image/png");
    const stored = new Uint8Array(await image.arrayBuffer());
    expect(detectImageType(stored)).toBe("image/png");
    expect(file.size).toBe(stored.length);
  });

  it("keeps the real file name when the app sends it percent-encoded", async () => {
    const { cookie } = await createSignedInUser();

    const response = await upload(cookie, { bytes: makePdf(), type: "application/pdf", name: "Factur%C4%83%20nr%201.pdf" });

    const { scan } = await response.json();
    const file = await prisma.file.findUniqueOrThrow({ where: { id: scan.id } });
    expect(file.originalName).toBe("Factură nr 1.pdf");
  });

  it("keeps a file name that is not valid percent-encoding as it is", async () => {
    const { cookie } = await createSignedInUser();

    const response = await upload(cookie, { bytes: makePdf(), type: "application/pdf", name: "100%.pdf" });

    const { scan } = await response.json();
    const file = await prisma.file.findUniqueOrThrow({ where: { id: scan.id } });
    expect(file.originalName).toBe("100%.pdf");
  });

  it("CA-14.2: the PDF goes straight to reading: the OCR service gets the picture of the page", async () => {
    const { cookie } = await createSignedInUser();

    const { scan } = await uploadAndRead(cookie, { bytes: makePdf(), type: "application/pdf", name: "factura.pdf" });

    expect(scan.status).toBe("DONE");
    expect(scan.reading.total.value).toBe("26.17");
    expect(readReceiptMock).toHaveBeenCalledTimes(1);
    const [bytes, mimeType] = readReceiptMock.mock.calls[0];
    expect(mimeType).toBe("image/png");
    expect(detectImageType(bytes)).toBe("image/png");
    expect(pngSize(bytes).height).toBe(2048);
  });

  it("CA-14.2: a PDF is saved in the selected profile like a photo", async () => {
    const withCompany = await createSignedInUser();
    await send("POST", "/api/company", { cui: "RO 14399840", name: "Exemplu SRL", address: "Str. 1" }, {
      cookie: withCompany.cookie,
    });

    const response = await upload(withCompany.cookie, { bytes: makePdf(), type: "application/pdf", context: "company" });

    expect((await response.json()).scan.context).toBe("company");
  });

  it("CA-14.2: a damaged PDF is refused with UNREADABLE_PDF and nothing is saved or read", async () => {
    const { cookie } = await createSignedInUser();

    const response = await upload(cookie, { bytes: makePdf().slice(0, 40), type: "application/pdf", name: "stricat.pdf" });

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("UNREADABLE_PDF");
    expect(await prisma.file.count()).toBe(0);
    expect(readReceiptMock).not.toHaveBeenCalled();
  });

  it("a PDF over 10 MB is refused with FILE_TOO_LARGE", async () => {
    const { cookie } = await createSignedInUser();
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(makePdf());

    const response = await upload(cookie, { bytes: big, type: "application/pdf", name: "mare.pdf" });

    expect(response.status).toBe(413);
    expect(await prisma.file.count()).toBe(0);
  });

  it("CA-14.1: a picture from the gallery or the files (PNG, WebP) is accepted like a photo", async () => {
    const { cookie } = await createSignedInUser();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

    const pngResponse = await upload(cookie, { bytes: png, type: "image/png", name: "bon.png" });
    const webpResponse = await upload(cookie, { bytes: webp, type: "image/webp", name: "bon.webp" });

    expect(pngResponse.status).toBe(202);
    expect(webpResponse.status).toBe(202);
  });
});

describe("GET /api/scans/:id", () => {
  it("CA-09.2: returns the values read, each with a confidence, once the reading is DONE", async () => {
    const { cookie } = await createSignedInUser();

    const { scan } = await uploadAndRead(cookie);

    expect(scan.status).toBe("DONE");
    expect(scan.errorCode).toBeNull();
    expect(scan.reading).toMatchObject({
      merchant: { value: "Carrefour express", confidence: 0.98 },
      date: { value: "2026-11-12", confidence: 0.98 },
      time: { value: "17:58", confidence: 0.98 },
      total: { value: "26.17", confidence: 0.98 },
      paymentMethod: { value: "CARD", confidence: 0.98 },
      itemsTotal: "26.17",
      totalMatches: true,
    });
    expect(scan.reading.items[1]).toEqual({
      name: { value: "DISCOUNT", confidence: 0.95 },
      quantity: { value: 1, confidence: 0.95 },
      amount: { value: "-3.20", confidence: 0.95 },
      category: { value: "GROCERIES", confidence: 0.95 },
    });
  });

  it("keeps the model's raw answer, the model name and the duration", async () => {
    const { cookie } = await createSignedInUser();

    const { scan } = await uploadAndRead(cookie);

    const stored = await prisma.ocrResult.findUniqueOrThrow({ where: { fileId: scan.id } });
    expect(stored).toMatchObject({ rawOutput: CARREFOUR_ANSWER, model: "qwen3-vl-4b", durationMs: 31000 });
  });

  it.each([
    ["the OCR service is not running", new OcrError("OCR_UNAVAILABLE", "down"), "OCR_UNAVAILABLE"],
    ["the OCR service is too slow", new OcrError("OCR_TIMEOUT", "slow"), "OCR_TIMEOUT"],
    ["something unexpected happens", new Error("boom"), "OCR_UNAVAILABLE"],
  ])("CA-10.2: is FAILED with a code when %s", async (_case, error, code) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    readReceiptMock.mockRejectedValue(error);
    const { cookie } = await createSignedInUser();

    const { scan } = await uploadAndRead(cookie);

    expect(scan).toMatchObject({ status: "FAILED", errorCode: code, reading: null });
  });

  it("CA-10.2: is FAILED with UNREADABLE when the photo is not a receipt", async () => {
    readReceiptMock.mockResolvedValue({ raw: "Nu văd niciun bon în imagine.", model: null, durationMs: 5000 });
    const { cookie } = await createSignedInUser();

    const { scan } = await uploadAndRead(cookie);

    expect(scan).toMatchObject({ status: "FAILED", errorCode: "UNREADABLE" });
    const stored = await prisma.ocrResult.findUniqueOrThrow({ where: { fileId: scan.id } });
    expect(stored.rawOutput).toBe("Nu văd niciun bon în imagine.");
  });

  it("counts a reading interrupted by a server restart as failed", async () => {
    const { cookie, email } = await createSignedInUser();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    // A reading left PROCESSING by a previous server process: this one never queued it.
    const orphan = await prisma.file.create({
      data: {
        userId: user.id,
        originalName: "receipt.jpg",
        mimeType: "image/jpeg",
        size: 1,
        storageKey: `${user.id}/orphan.jpg`,
        uploadedAt: new Date(Date.now() - 5 * 60 * 1000),
        ocrResult: { create: { status: "PROCESSING" } },
      },
    });

    const after = await (await get(`/api/scans/${orphan.id}`, { cookie })).json();

    expect(after.scan).toMatchObject({ status: "FAILED", errorCode: "OCR_TIMEOUT" });
  });

  it("keeps a reading that is still waiting in the queue as PROCESSING, however long it waits", async () => {
    const { answer } = slowOcr();
    readReceiptMock.mockImplementation(() => answer);
    const { cookie } = await createSignedInUser();
    const { scan } = await (await upload(cookie)).json();
    await prisma.file.update({ where: { id: scan.id }, data: { uploadedAt: new Date(Date.now() - 60 * 60 * 1000) } });

    const after = await (await get(`/api/scans/${scan.id}`, { cookie })).json();

    expect(after.scan.status).toBe("PROCESSING");
  });

  it("sends the readings to the OCR service one at a time, never together", async () => {
    const first = slowOcr();
    const second = slowOcr();
    readReceiptMock.mockImplementationOnce(() => first.answer).mockImplementationOnce(() => second.answer);
    const { cookie } = await createSignedInUser();

    const a = (await (await upload(cookie)).json()).scan;
    const b = (await (await upload(cookie)).json()).scan;
    await new Promise((resolve) => setTimeout(resolve, 200));

    // The second photo waits while the first one is being read.
    expect(readReceiptMock).toHaveBeenCalledTimes(1);

    first.release();
    await waitForScan(a.id);
    // The second reading starts only now; wait for it to reach the OCR service (database lookups take a moment).
    await vi.waitFor(() => expect(readReceiptMock).toHaveBeenCalledTimes(2), { timeout: 15_000, interval: 50 });

    second.release();
    await waitForScan(b.id);
    const done = await (await get(`/api/scans/${b.id}`, { cookie })).json();
    expect(done.scan.status).toBe("DONE");
  });

  it("returns 404 for a missing scan and for another user's scan", async () => {
    const owner = await createSignedInUser();
    const { uploaded } = await uploadAndRead(owner.cookie);
    const other = await createSignedInUser();

    const missing = await get("/api/scans/does-not-exist", { cookie: owner.cookie });
    const foreign = await get(`/api/scans/${uploaded.id}`, { cookie: other.cookie });

    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect((await foreign.json()).code).toBe("SCAN_NOT_FOUND");
  });
});

describe("GET /api/scans/:id/image", () => {
  it("returns the uploaded photo to its owner only", async () => {
    const owner = await createSignedInUser();
    const { uploaded } = await uploadAndRead(owner.cookie);
    const other = await createSignedInUser();

    const mine = await get(`/api/scans/${uploaded.id}/image`, { cookie: owner.cookie });
    const foreign = await get(`/api/scans/${uploaded.id}/image`, { cookie: other.cookie });

    expect(mine.status).toBe(200);
    expect(mine.headers.get("Content-Type")).toBe("image/jpeg");
    expect(Array.from(new Uint8Array(await mine.arrayBuffer()))).toEqual(Array.from(JPEG));
    expect(foreign.status).toBe(404);
  });
});

describe("CA-10.1 & CA-10.2: stages and POST /api/scans/:id/retry", () => {
  it("CA-10.1: tracks the real stage of reading (READING → EXTRACTING_FIELDS → EXTRACTING_ITEMS)", async () => {
    expect(stageFromPartialOutput("{")).toBe("READING");
    expect(stageFromPartialOutput('{"merchant": {"value": "Mega Image"')).toBe("EXTRACTING_FIELDS");
    expect(stageFromPartialOutput('{"merchant": {"value": "Mega"}, "items": [')).toBe("EXTRACTING_ITEMS");

    let emitProgress: ((partial: string) => void) | undefined;
    const { answer, release } = slowOcr();
    readReceiptMock.mockImplementation((_bytes, _mime, onProgress) => {
      emitProgress = onProgress;
      return answer;
    });

    const { cookie } = await createSignedInUser();
    const { scan: initial } = await (await upload(cookie)).json();
    expect(initial).toMatchObject({ status: "PROCESSING", stage: "READING" });

    await vi.waitFor(() => expect(emitProgress).toBeDefined(), { timeout: 10_000 });
    emitProgress?.('{"merchant": {"value": "Carrefour"}');
    const midFields = (await (await get(`/api/scans/${initial.id}`, { cookie })).json()).scan;
    expect(midFields).toMatchObject({ status: "PROCESSING", stage: "EXTRACTING_FIELDS" });

    emitProgress?.('{"merchant": {"value": "Carrefour"}, "items": [');
    const midItems = (await (await get(`/api/scans/${initial.id}`, { cookie })).json()).scan;
    expect(midItems).toMatchObject({ status: "PROCESSING", stage: "EXTRACTING_ITEMS" });

    release();
    await waitForScan(initial.id);
    const done = (await (await get(`/api/scans/${initial.id}`, { cookie })).json()).scan;
    expect(done).toMatchObject({ status: "DONE", stage: null });
  });

  it("CA-10.2: POST /api/scans/:id/retry restarts a failed scan and completes once OCR is back up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    readReceiptMock.mockRejectedValueOnce(new OcrError("OCR_UNAVAILABLE", "down"));
    const { cookie } = await createSignedInUser();

    const { scan: failed } = await uploadAndRead(cookie);
    expect(failed).toMatchObject({ status: "FAILED", errorCode: "OCR_UNAVAILABLE" });

    readReceiptMock.mockResolvedValueOnce({ raw: CARREFOUR_ANSWER, model: "qwen3-vl-4b", durationMs: 12000 });
    const retryResponse = await send("POST", `/api/scans/${failed.id}/retry`, {}, { cookie });
    expect(retryResponse.status).toBe(202);
    const { scan: restarted } = await retryResponse.json();
    expect(restarted).toMatchObject({ status: "PROCESSING", stage: "READING", errorCode: null });

    await waitForScan(failed.id);
    const afterRetry = (await (await get(`/api/scans/${failed.id}`, { cookie })).json()).scan;
    expect(afterRetry).toMatchObject({ status: "DONE", errorCode: null });
    expect(afterRetry.reading?.merchant.value).toBe("Carrefour express");
  });

  it("POST /api/scans/:id/retry returns 404 for a missing scan or another user's scan", async () => {
    const owner = await createSignedInUser();
    const { uploaded } = await uploadAndRead(owner.cookie);
    const other = await createSignedInUser();

    const missing = await send("POST", "/api/scans/does-not-exist/retry", {}, { cookie: owner.cookie });
    const foreign = await send("POST", `/api/scans/${uploaded.id}/retry`, {}, { cookie: other.cookie });

    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
  });
});

describe("US-09: PDFs are read with all their pages", () => {
  const readTextMock = vi.mocked(readReceiptText);
  const readPagesMock = vi.mocked(readReceiptPages);
  const answer = { raw: CARREFOUR_ANSWER, model: "qwen3-vl-4b", durationMs: 20000 };

  beforeEach(() => {
    readTextMock.mockReset().mockResolvedValue(answer);
    readPagesMock.mockReset().mockResolvedValue(answer);
  });

  it("reads a generated PDF (with text) from its text, every page, not from the picture", async () => {
    const { cookie } = await createSignedInUser();
    const pdf = makePdf([
      { width: 595, height: 842, text: "Factura VAIE102059 VANESSE SARL" },
      { width: 595, height: 842, text: "Incarcator 100W 166,00 TVA 33,20" },
      { width: 595, height: 842, text: "Total de plata 184,20 RON card" },
      { width: 595, height: 842, text: "Furnizor CIF RO12345678 Cluj" },
    ]);

    const { scan } = await uploadAndRead(cookie, { bytes: pdf, type: "application/pdf", name: "factura.pdf" });

    expect(scan.status).toBe("DONE");
    expect(readReceiptMock).not.toHaveBeenCalled();
    expect(readTextMock).toHaveBeenCalledTimes(1);
    const [pages] = readTextMock.mock.calls[0];
    expect(pages).toHaveLength(4);
    expect(pages[2]).toContain("184,20");
    // The app still gets the picture of the first page to show.
    const file = await prisma.file.findUniqueOrThrow({ where: { id: scan.id } });
    expect(file.mimeType).toBe("image/png");
  });

  it("reads a scanned PDF (no text) with several pages as one picture per page", async () => {
    const { cookie } = await createSignedInUser();
    const pdf = makePdf([
      { width: 595, height: 842, text: "A" },
      { width: 595, height: 842, text: "B" },
    ]);

    const { scan } = await uploadAndRead(cookie, { bytes: pdf, type: "application/pdf", name: "scan.pdf" });

    expect(scan.status).toBe("DONE");
    expect(readTextMock).not.toHaveBeenCalled();
    expect(readPagesMock).toHaveBeenCalledTimes(1);
    expect(readPagesMock.mock.calls[0][0]).toHaveLength(2);
  });
});
