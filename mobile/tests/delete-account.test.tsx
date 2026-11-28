import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import SettingsScreen from "@/app/(app)/settings";
import { apiFetch } from "@/lib/api";
import { setLanguageSetting } from "@/i18n";
import { signOut } from "@/lib/sign-out";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(async () => {}) }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { email: "ana@example.com" } } }) },
}));
jest.mock("@/lib/profile-context", () => ({
  useProfile: () => ({ profile: { firstName: "Ana", lastName: "Popescu" }, company: null, activeContext: "personal" }),
}));
jest.mock("@/lib/sign-out", () => ({ signOut: jest.fn() }));

const apiFetchMock = apiFetch as unknown as jest.Mock;
const signOutMock = signOut as unknown as jest.Mock;

function respond(status: number) {
  apiFetchMock.mockResolvedValueOnce({ ok: status < 400, status });
}

async function openConfirmation() {
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Șterge contul" }));
}

function confirm() {
  return fireEvent.press(screen.getByRole("button", { name: "Șterge definitiv" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  signOutMock.mockResolvedValue(undefined);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  setLanguageSetting("ro");
});

afterAll(() => {
  setLanguageSetting("auto");
});

describe("Șterge contul (US-12)", () => {
  it("CA-12.1: Contul meu offers Șterge contul, without asking anything yet", async () => {
    await render(<SettingsScreen />);

    expect(screen.getByRole("button", { name: "Șterge contul" })).toBeOnTheScreen();
    expect(screen.queryByText("Ștergi contul?")).toBeNull();
  });

  it("CA-12.1: asks for confirmation and deletes nothing before it", async () => {
    await openConfirmation();

    expect(screen.getByText("Ștergi contul?")).toBeOnTheScreen();
    expect(screen.getByText(/vor fi șterse definitiv/)).toBeOnTheScreen();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("CA-12.1: Renunță closes the question and keeps the account", async () => {
    await openConfirmation();

    await fireEvent.press(screen.getByRole("button", { name: "Renunță" }));

    expect(screen.queryByText("Ștergi contul?")).toBeNull();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("CA-12.1 / CA-12.2: after confirming, deletes the account on the server and then signs out", async () => {
    respond(204);
    await openConfirmation();

    await confirm();

    expect(apiFetchMock).toHaveBeenCalledWith("/api/me", { method: "DELETE" });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.invocationCallOrder[0]).toBeLessThan(signOutMock.mock.invocationCallOrder[0]);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("CA-12.2: signs out too when the session is already gone", async () => {
    respond(401);
    await openConfirmation();

    await confirm();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("shows no error when clearing the phone's session fails after the account was deleted", async () => {
    respond(204);
    signOutMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    await openConfirmation();

    await confirm();

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("keeps the user signed in and says so when the server cannot delete the account", async () => {
    respond(500);
    await openConfirmation();

    await confirm();

    expect(Alert.alert).toHaveBeenCalledWith("Nu am putut șterge contul", expect.any(String));
    expect(signOut).not.toHaveBeenCalled();
  });

  it("CA-01.7: shows Serverul nu răspunde and keeps the account when the server does not answer", async () => {
    apiFetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    await openConfirmation();

    await confirm();

    expect(Alert.alert).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
    expect(signOut).not.toHaveBeenCalled();
  });

  it("two quick taps send the deletion only once", async () => {
    let resolve: (value: unknown) => void = () => {};
    apiFetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await openConfirmation();
    const button = screen.getByRole("button", { name: "Șterge definitiv" });

    await act(async () => {
      const onClick = button.props.onClick as (event: unknown) => void;
      const press = () => onClick({ nativeEvent: {}, target: button, currentTarget: button });
      press();
      press();
      resolve({ ok: true, status: 204 });
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("US-17: is shown in English", async () => {
    setLanguageSetting("en");
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Delete account" }));

    expect(screen.getByText("Delete your account?")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Delete for good" })).toBeOnTheScreen();
  });
});
