import * as SecureStore from "expo-secure-store";

const mockExpoClient = jest.fn((_options: unknown) => ({ id: "expo" }));

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock("@better-auth/expo/client", () => ({ expoClient: (options: unknown) => mockExpoClient(options) }));
jest.mock("better-auth/react", () => ({ createAuthClient: jest.fn(() => ({})) }));
jest.mock("better-auth/client/plugins", () => ({
  emailOTPClient: jest.fn(() => ({})),
  inferAdditionalFields: jest.fn(() => ({})),
}));
jest.mock("@/lib/config", () => ({ API_URL: "http://localhost:3000" }));

describe("sesiune păstrată criptat pe telefon", () => {
  it("CA-02.9: the session cookie is stored in SecureStore (Keychain / Keystore)", () => {
    require("@/lib/auth-client");

    expect(mockExpoClient).toHaveBeenCalledWith(expect.objectContaining({ storage: SecureStore }));
  });
});
