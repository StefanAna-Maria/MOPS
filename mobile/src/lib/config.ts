import Constants from "expo-constants";

export const REQUEST_TIMEOUT = 10000;

const API_PORT = 3000;

function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host ?? "localhost"}:${API_PORT}`;
}

export const API_URL = resolveApiUrl();
