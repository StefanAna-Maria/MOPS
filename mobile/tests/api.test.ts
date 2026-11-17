import { apiFetch } from "@/lib/api";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

jest.mock("@/lib/auth-client", () => ({ authClient: { getCookie: jest.fn(async () => "session=abc") } }));
jest.mock("@/lib/config", () => ({ API_URL: "http://api.test", REQUEST_TIMEOUT: 10000 }));
jest.mock("@/lib/fetch-with-timeout", () => ({ fetchWithTimeout: jest.fn(async () => ({ ok: true })) }));

const fetchMock = fetchWithTimeout as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("apiFetch", () => {
  it("sends JSON requests with the session cookie and the default timeout", async () => {
    await apiFetch("/api/me");

    const [url, init, timeout] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/me");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", Cookie: "session=abc" });
    expect(timeout).toBe(10000);
  });

  it("US-09: lets fetch set the multipart Content-Type for an upload, and accepts a longer timeout", async () => {
    await apiFetch("/api/scans", { method: "POST", body: new FormData() }, { timeoutMs: 60000 });

    const [, init, timeout] = fetchMock.mock.calls[0];
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.headers.Cookie).toBe("session=abc");
    expect(timeout).toBe(60000);
  });
});
