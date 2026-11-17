import { REQUEST_TIMEOUT } from "./config";

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const outerSignal = init.signal;
  const abortFromOuter = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) {
      controller.abort();
    } else {
      outerSignal.addEventListener("abort", abortFromOuter);
    }
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener("abort", abortFromOuter);
  }
}
