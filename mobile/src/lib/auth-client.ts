import { createAuthClient } from "better-auth/react";
import { emailOTPClient, inferAdditionalFields } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { getLanguage } from "@/i18n";

export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: {
    // US-17: the server writes the emails with the code (confirmation, password reset) in the app's language.
    customFetchImpl: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("Accept-Language", getLanguage());
      return fetchWithTimeout(input, { ...init, headers });
    },
  },
  plugins: [
    expoClient({
      scheme: "ocrinvoice",
      storagePrefix: "ocrinvoice",
      storage: SecureStore,
    }),
    emailOTPClient(),
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
