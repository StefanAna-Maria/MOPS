import type { ScanErrorCode } from "@ocrinvoice/shared";
import { OCR_PROMPT } from "./ocr-prompt.js";

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

/**
 * CA-09.1: sends the photo to the OCR microservice (Qwen3-VL on llama.cpp, OpenAI-compatible API) and returns the
 * model's answer. Throws OcrError with OCR_UNAVAILABLE or OCR_TIMEOUT.
 */
export async function readReceipt(image: Uint8Array, mimeType: string): Promise<OcrAnswer> {
  const started = Date.now();
  const dataUrl = `data:${mimeType};base64,${Buffer.from(image).toString("base64")}`;

  let response: Response;
  try {
    response = await fetch(`${ocrUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(ocrTimeoutMs()),
      body: JSON.stringify({
        temperature: 0,
        max_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: OCR_PROMPT },
            ],
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

  const data = (await response.json().catch(() => null)) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
  } | null;
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    throw new OcrError("UNREADABLE", "The OCR service returned no text");
  }
  return { raw, model: data?.model ?? null, durationMs: Date.now() - started };
}
