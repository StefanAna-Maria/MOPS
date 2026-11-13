import { authClient } from "@/lib/auth-client";
import { hasSignedOutThisSession, signOut } from "@/lib/sign-out";

jest.mock("@/lib/auth-client", () => ({
  authClient: { signOut: jest.fn().mockResolvedValue({ data: { success: true } }) },
}));

describe("signOut", () => {
  it("CA-01.14: closes the session through Better Auth and remembers it for the redirect", async () => {
    expect(hasSignedOutThisSession()).toBe(false);

    await signOut();

    expect(authClient.signOut).toHaveBeenCalledTimes(1);
    expect(hasSignedOutThisSession()).toBe(true);
  });
});
