import { authClient } from "./auth-client";
import { API_URL } from "./config";
import { fetchWithTimeout } from "./fetch-with-timeout";

export async function apiFetch(path: string, init: RequestInit = {}) {
  const cookie = await authClient.getCookie();
  return fetchWithTimeout(`${API_URL}${path}`, {
    ...init,
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...init.headers,
    },
  });
}
