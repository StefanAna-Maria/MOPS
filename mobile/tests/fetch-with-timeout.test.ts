import { REQUEST_TIMEOUT } from "@/lib/config";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

function fetchThatWaitsForAbort() {
  return jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(new Error("Aborted"));
        return;
      }
      init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
    });
  });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

describe("fetchWithTimeout", () => {
  it("returns the response when the server answers in time", async () => {
    const response = { ok: true } as Response;
    globalThis.fetch = jest.fn().mockResolvedValue(response);

    await expect(fetchWithTimeout("http://server/api/health")).resolves.toBe(response);
  });

  it("CA-01.7: stops waiting after the request timeout", async () => {
    jest.useFakeTimers();
    globalThis.fetch = fetchThatWaitsForAbort() as unknown as typeof fetch;

    const request = fetchWithTimeout("http://server/api/health");
    jest.advanceTimersByTime(REQUEST_TIMEOUT);

    await expect(request).rejects.toThrow("Aborted");
  });

  it("CA-01.7: uses a 10 second timeout", () => {
    expect(REQUEST_TIMEOUT).toBe(10000);
  });

  it("does not stop before the timeout", async () => {
    jest.useFakeTimers();
    const fetchMock = fetchThatWaitsForAbort();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    fetchWithTimeout("http://server/api/health");
    jest.advanceTimersByTime(REQUEST_TIMEOUT - 1);

    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
  });

  it("also stops when the caller cancels the request", async () => {
    globalThis.fetch = fetchThatWaitsForAbort() as unknown as typeof fetch;
    const controller = new AbortController();

    const request = fetchWithTimeout("http://server/api/health", { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toThrow("Aborted");
  });

  it("stops at once when the caller has already cancelled", async () => {
    globalThis.fetch = fetchThatWaitsForAbort() as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort();

    await expect(fetchWithTimeout("http://server/api/health", { signal: controller.signal })).rejects.toThrow(
      "Aborted",
    );
  });
});
