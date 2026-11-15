import { render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { ProfileProvider, useProfile } from "@/lib/profile-context";
import { apiFetch } from "@/lib/api";
import { signOut } from "@/lib/sign-out";

jest.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user-1" } }, isPending: false }) },
}));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/sign-out", () => ({ signOut: jest.fn(() => Promise.resolve()) }));

const apiFetchMock = apiFetch as unknown as jest.Mock;

function Probe() {
  const { profile, hasError } = useProfile();
  return <Text>{hasError ? "error" : (profile?.firstName ?? "loading")}</Text>;
}

function response(status: number, body: unknown = {}) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("sesiune păstrată", () => {
  it("CA-02.8: with a stored session the profile is loaded and nobody is signed out", async () => {
    apiFetchMock.mockResolvedValue(
      response(200, { user: { id: "user-1" }, profile: { firstName: "Ana", personalEnabled: true }, company: null }),
    );

    await render(
      <ProfileProvider>
        <Probe />
      </ProfileProvider>,
    );

    await waitFor(() => expect(screen.getByText("Ana")).toBeOnTheScreen());
    expect(signOut).not.toHaveBeenCalled();
  });

  it("CA-02.10: a session closed on the server (401) signs the user out", async () => {
    apiFetchMock.mockResolvedValue(response(401));

    await render(
      <ProfileProvider>
        <Probe />
      </ProfileProvider>,
    );

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("error")).not.toBeOnTheScreen();
  });

  it("a server error keeps the user signed in and shows the error", async () => {
    apiFetchMock.mockResolvedValue(response(500));

    await render(
      <ProfileProvider>
        <Probe />
      </ProfileProvider>,
    );

    await waitFor(() => expect(screen.getByText("error")).toBeOnTheScreen());
    expect(signOut).not.toHaveBeenCalled();
  });

  it("an unreachable server keeps the user signed in", async () => {
    apiFetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await render(
      <ProfileProvider>
        <Probe />
      </ProfileProvider>,
    );

    await waitFor(() => expect(screen.getByText("error")).toBeOnTheScreen());
    expect(signOut).not.toHaveBeenCalled();
  });
});
