import { authClient } from "./auth-client";
import { API_URL, REQUEST_TIMEOUT } from "./config";
import { deviceTimeZone } from "./dates";
import { fetchWithTimeout } from "./fetch-with-timeout";

type ApiFetchOptions = {
  /** How long to wait before giving up (default REQUEST_TIMEOUT); uploads need longer on slow networks. */
  timeoutMs?: number;
};

export async function apiFetch(path: string, init: RequestInit = {}, options: ApiFetchOptions = {}) {
  const cookie = await authClient.getCookie();
  const timeZone = deviceTimeZone();
  // A multipart upload must not be labelled JSON: fetch sets the multipart Content-Type with its boundary.
  const isUpload = typeof FormData !== "undefined" && init.body instanceof FormData;
  return fetchWithTimeout(
    `${API_URL}${path}`,
    {
      ...init,
      credentials: "omit",
      headers: {
        ...(isUpload ? {} : { "Content-Type": "application/json" }),
        Cookie: cookie,
        ...(timeZone ? { "X-Time-Zone": timeZone } : {}),
        ...init.headers,
      },
    },
    options.timeoutMs ?? REQUEST_TIMEOUT,
  );
}
