import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";
import { fetchWithTimeout } from "./fetch-with-timeout";

export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: {
    customFetchImpl: fetchWithTimeout,
  },
  plugins: [
    expoClient({
      scheme: "ocrinvoice",
      storagePrefix: "ocrinvoice",
      storage: SecureStore,
    }),
    inferAdditionalFields({
      user: {
        usageType: {
          type: "string",
          required: false,
        },
      },
    }),
  ],
});
