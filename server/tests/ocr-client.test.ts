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
    // Without a progress listener there is nothing to stream to.
    expect(body.stream).toBe(false);
    expect(body.cache_prompt).toBe(true);
    // The photo comes FIRST: with the instructions first the model misread digits on a real phone photo.
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

  it("CA-10.1: calls onProgress as SSE chunks arrive when the OCR service streams", async () => {
    const chunks = [
      'data: {"model":"qwen3-vl-4b","choices":[{"delta":{"content":"{\\"merchant\\": {\\"value\\": \\"Mega\\"},"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"\\"items\\": []}"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(
      new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    );

    const progressUpdates: string[] = [];
    const answer = await readReceipt(IMAGE, "image/jpeg", (partial) => progressUpdates.push(partial));

    // Regression (2026-11-21): the request must ask llama.cpp to stream, otherwise it answers all at once and the
    // stage never leaves READING on a real phone (this test's fake server streams regardless of what was asked).
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
    expect(answer.raw).toBe('{"merchant": {"value": "Mega"},"items": []}');
    expect(answer.model).toBe("qwen3-vl-4b");
    expect(progressUpdates).toEqual([
      '{"merchant": {"value": "Mega"},',
      '{"merchant": {"value": "Mega"},"items": []}',
    ]);
  });
});
