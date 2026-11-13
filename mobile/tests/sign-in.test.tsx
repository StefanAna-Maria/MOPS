import { Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import SignInScreen from "@/app/(auth)/sign-in";
import { authClient } from "@/lib/auth-client";

jest.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: jest.fn() } },
}));

const signInEmail = authClient.signIn.email as unknown as jest.Mock;

async function fillForm(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.changeText(screen.getByLabelText("Parolă"), password);
}

function submitButton() {
  return screen.getByRole("button", { name: "Intră în cont" });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("Intră în cont", () => {
  it("CA-01.13: shows the Ai uitat parola? and Nu ai cont? Creează unul links", async () => {
    await render(<SignInScreen />);

    const forgot = screen.getByRole("link", { name: "Ai uitat parola?" });
    const signUp = screen.getByRole("link", { name: "Nu ai cont? Creează unul" });
    expect(forgot.props.accessibilityHint).toBe("/forgot-password");
    expect(signUp.props.accessibilityHint).toBe("/sign-up");
  });

  it("the button is disabled until an email and a password are typed", async () => {
    await render(<SignInScreen />);
    expect(submitButton()).toBeDisabled();

    await fillForm("ana@example.com", "Parola123");

    expect(submitButton()).toBeEnabled();
  });

  it("CA-01.8: signs in without any error message", async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null });
    await render(<SignInScreen />);

    await fillForm("Ana@Example.com", "Parola123");
    await fireEvent.press(submitButton());

    expect(signInEmail).toHaveBeenCalledWith({ email: "ana@example.com", password: "Parola123" });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("CA-01.9: shows Nu am putut intra for a wrong email or password", async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" } });
    await render(<SignInScreen />);

    await fillForm("ana@example.com", "Gresita123");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith(
      "Nu am putut intra",
      "Emailul sau parola nu se potrivesc. Verifică-le și încearcă din nou.",
    );
  });

  it("CA-01.10: opens Verifică-ți emailul for an unconfirmed account", async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 403, code: "EMAIL_NOT_VERIFIED" } });
    await render(<SignInScreen />);

    await fillForm("ana@example.com", "Parola123");
    await fireEvent.press(submitButton());

    expect(router.push).toHaveBeenCalledWith({ pathname: "/verify-email", params: { email: "ana@example.com" } });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("CA-01.11: shows Prea multe încercări when the server limits requests", async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 429 } });
    await render(<SignInScreen />);

    await fillForm("ana@example.com", "Gresita123");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Prea multe încercări", expect.any(String));
  });

  it("CA-01.7: shows Serverul nu răspunde and keeps the typed data", async () => {
    signInEmail.mockRejectedValue(new TypeError("Network request failed"));
    await render(<SignInScreen />);

    await fillForm("ana@example.com", "Parola123");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
    expect(screen.getByLabelText("Email")).toHaveDisplayValue("ana@example.com");
    expect(screen.getByLabelText("Parolă")).toHaveDisplayValue("Parola123");
  });
});
