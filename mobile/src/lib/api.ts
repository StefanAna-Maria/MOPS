import { authClient } from "./auth-client";
import { API_URL } from "./config";
import { deviceTimeZone } from "./dates";
import { fetchWithTimeout } from "./fetch-with-timeout";

export async function apiFetch(path: string, init: RequestInit = {}) {
  const cookie = await authClient.getCookie();
  const timeZone = deviceTimeZone();
  return fetchWithTimeout(`${API_URL}${path}`, {
    ...init,
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(timeZone ? { "X-Time-Zone": timeZone } : {}),
      ...init.headers,
    },
  });
}
