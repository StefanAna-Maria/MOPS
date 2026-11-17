import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OcrError, readReceipt } from "../src/lib/ocr-client.js";
import { OCR_PROMPT } from "../src/lib/ocr-prompt.js";

const IMAGE = new Uint8Array([1, 2, 3]);
const fetchMock = vi.fn();

function ocrAnswer(content: string, status = 200) {
  return new Response(JSON.stringify({ model: "qwen3-vl-4b", choices: [{ message: { content } }] }), { status });
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof OcrError ? error.code : `not an OcrError: ${String(error)}`;
  }
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.OCR_URL = "http://ocr.test:8080/";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OCR_URL;
});

describe("readReceipt", () => {
  it("CA-09.1: sends the photo and the prompt to the OCR service's chat endpoint", async () => {
    fetchMock.mockResolvedValue(ocrAnswer('{"merchant": null}'));

    const answer = await readReceipt(IMAGE, "image/jpeg");

    expect(answer).toMatchObject({ raw: '{"merchant": null}', model: "qwen3-vl-4b" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ocr.test:8080/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.temperature).toBe(0);
    expect(body.messages[0].content).toEqual([
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AQID" } },
      { type: "text", text: OCR_PROMPT },
    ]);
  });

  it("CA-10.2: OCR_UNAVAILABLE when the service is not running", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed: ECONNREFUSED"));

    expect(await codeOf(readReceipt(IMAGE, "image/jpeg"))).toBe("OCR_UNAVAILABLE");
  });

  it("CA-10.2: OCR_TIMEOUT when the service does not answer in time", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));

    expect(await codeOf(readReceipt(IMAGE, "image/jpeg"))).toBe("OCR_TIMEOUT");
  });

  it("OCR_UNAVAILABLE when the service answers with an error status", async () => {
    fetchMock.mockResolvedValue(ocrAnswer("", 503));

    expect(await codeOf(readReceipt(IMAGE, "image/jpeg"))).toBe("OCR_UNAVAILABLE");
  });

  it("UNREADABLE when the service answers without text", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 }));

    expect(await codeOf(readReceipt(IMAGE, "image/jpeg"))).toBe("UNREADABLE");
  });
});
