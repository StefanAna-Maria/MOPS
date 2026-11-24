import type { ScanErrorCode } from "@ocrinvoice/shared";
import { OCR_ANSWER_NOW, OCR_PROMPT } from "./ocr-prompt.js";

/** A failed reading, with the code shown to the app (see SCAN_ERROR_CODES). */
export class OcrError extends Error {
  constructor(
    readonly code: ScanErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type OcrAnswer = {
  /** The model's text answer, exactly as received. */
  raw: string;
  model: string | null;
  durationMs: number;
};

function ocrUrl() {
  return (process.env.OCR_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
}

function ocrTimeoutMs() {
  const value = Number(process.env.OCR_TIMEOUT_MS);
  // A long receipt (11 lines, 2026-11-15) took ~2 minutes on the 4B model with integrated graphics.
  return Number.isFinite(value) && value > 0 ? value : 300_000;
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onProgress?: (partialText: string) => void,
): Promise<{ raw: string; model: string | null }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  let model: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }
      try {
        const chunk = JSON.parse(payload) as {
          model?: string;
          choices?: { delta?: { content?: string }; message?: { content?: string } }[];
        };
        if (chunk.model) {
          model = chunk.model;
        }
        const piece = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content;
        if (typeof piece === "string" && piece.length > 0) {
          raw += piece;
          onProgress?.(raw);
        }
      } catch {
        // Ignore malformed SSE lines and continue reading chunks.
      }
    }
  }
  return { raw, model };
}

type ContentPart = { type: "image_url"; image_url: { url: string } } | { type: "text"; text: string };

function imagePart(image: Uint8Array, mimeType: string): ContentPart {
  return { type: "image_url", image_url: { url: `data:${mimeType};base64,${Buffer.from(image).toString("base64")}` } };
}

/** PDF text sent to the model is cut at this length (an invoice page is ~2,000 characters). */
const MAX_PDF_TEXT_CHARS = 16_000;

/**
 * CA-09.1 / CA-10.1: sends the photo to the OCR microservice (Qwen3-VL on llama.cpp, OpenAI-compatible API) and
 * returns the model's answer, calling `onProgress` as partial output arrives. Throws OcrError with OCR_UNAVAILABLE or OCR_TIMEOUT.
 */
export function readReceipt(
  image: Uint8Array,
  mimeType: string,
  onProgress?: (partialText: string) => void,
): Promise<OcrAnswer> {
  // Photo FIRST, then the instructions: with the instructions first (to reuse them from llama.cpp's cache) the model
  // misread digits on a real phone photo (16,69 for 16,99; 2,85 for 6,79) in 2 of 2 tries; photo first read it
  // right in 2 of 2 (2026-11-24). Accuracy matters more than the ~10 s the cache would save.
  return requestOcr([imagePart(image, mimeType), { type: "text", text: OCR_PROMPT }], onProgress);
}

/** US-09: several pages of one document (a PDF without text), read together as one document. */
export function readReceiptPages(
  images: { bytes: Uint8Array; mimeType: string }[],
  onProgress?: (partialText: string) => void,
): Promise<OcrAnswer> {
  const note =
    images.length > 1
      ? `Imaginile de mai sus sunt cele ${images.length} pagini ale ACELUIAȘI document, în ordine. Citește-le împreună: produsele pot continua pe pagina următoare, iar totalul de plată este de obicei pe ultima pagină.\n\n`
      : "";
  return requestOcr(
    // Pictures first, then the instructions (see readReceipt).
    [...images.map((image) => imagePart(image.bytes, image.mimeType)), { type: "text", text: note + OCR_PROMPT }],
    onProgress,
  );
}

/**
 * US-09: the text of a PDF (all its pages), read exactly instead of recognized from a picture. Generated invoices
 * (shops, marketplaces, e-Factura) have real text; it is faster than an image and has no misread digits.
 */
export function readReceiptText(pages: string[], onProgress?: (partialText: string) => void): Promise<OcrAnswer> {
  const text = pages
    .map((page, index) => `--- Pagina ${index + 1} din ${pages.length} ---\n${page}`)
    .join("\n\n")
    .slice(0, MAX_PDF_TEXT_CHARS);
  const documentText =
    "Documentul NU este o imagine: mai jos este textul extras din fișierul PDF al documentului, pagină cu pagină (coloanele tabelelor pot apărea pe rânduri separate). Aplică aceleași reguli ca pentru o imagine.\n\n" +
    `<<<TEXTUL DOCUMENTULUI\n${text}\nSFÂRȘITUL TEXTULUI>>>\n\n`;
  // Instructions first, so they are reused from the previous reading; the document's text comes after them.
  return requestOcr([{ type: "text", text: `${OCR_PROMPT}\n\n${documentText}${OCR_ANSWER_NOW}` }], onProgress);
}

async function requestOcr(content: ContentPart[], onProgress?: (partialText: string) => void): Promise<OcrAnswer> {
  const started = Date.now();

  let response: Response;
  try {
    response = await fetch(`${ocrUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(ocrTimeoutMs()),
      body: JSON.stringify({
        temperature: 0,
        // Reuse the identical beginning (the instructions) from the previous reading instead of reading it again.
        cache_prompt: true,
        // Invoice lines carry unit price and VAT too: 2000 tokens could cut a long invoice short.
        max_tokens: 4096,
        // CA-10.1: ask llama.cpp to stream the answer so the stages can follow it. Without this it sends the whole
        // answer at the end, and on a real phone the stage stayed "READING" for the full ~2 minutes (2026-11-21).
        stream: Boolean(onProgress),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content,
          },
        ],
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new OcrError("OCR_TIMEOUT", "The OCR service did not answer in time");
    }
    throw new OcrError("OCR_UNAVAILABLE", `The OCR service is not reachable: ${String(error)}`);
  }

  if (!response.ok) {
    throw new OcrError("OCR_UNAVAILABLE", `The OCR service answered HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && response.body) {
    const streamed = await readEventStream(response.body, onProgress);
    if (!streamed.raw) {
      throw new OcrError("UNREADABLE", "The OCR service returned no text");
    }
    return { raw: streamed.raw, model: streamed.model, durationMs: Date.now() - started };
  }

  const data = (await response.json().catch(() => null)) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
  } | null;
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    throw new OcrError("UNREADABLE", "The OCR service returned no text");
  }
  onProgress?.(raw);
  return { raw, model: data?.model ?? null, durationMs: Date.now() - started };
}
