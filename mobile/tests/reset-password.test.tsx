import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import ResetPasswordScreen from "@/app/(auth)/reset-password";
import { authClient } from "@/lib/auth-client";

jest.mock("@/lib/auth-client", () => ({
  authClient: {
    emailOtp: { resetPassword: jest.fn(), requestPasswordReset: jest.fn() },
    signIn: { email: jest.fn() },
  },
}));

const resetPassword = authClient.emailOtp.resetPassword as unknown as jest.Mock;
const requestPasswordReset = authClient.emailOtp.requestPasswordReset as unknown as jest.Mock;
const signInEmail = authClient.signIn.email as unknown as jest.Mock;

function submitButton() {
  return screen.getByRole("button", { name: "Schimbă parola" });
}

async function fillForm(code: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText("Cod de confirmare"), code);
  await fireEvent.changeText(screen.getByLabelText("Parolă nouă"), password);
}

async function waitSeconds(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  (useLocalSearchParams as jest.Mock).mockReturnValue({ email: "ana@example.com" });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Parolă nouă", () => {
  it("CA-02.11: shows the address the code was sent to and six boxes", async () => {
    await render(<ResetPasswordScreen />);

    expect(screen.getByText("Am trimis un cod de 6 cifre la ana@example.com.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Cod de confirmare")).toBeOnTheScreen();
  });

  it("shows the three password rules", async () => {
    await render(<ResetPasswordScreen />);

    expect(screen.getByText("Cel puțin 8 caractere")).toBeOnTheScreen();
    expect(screen.getByText("Cel puțin o cifră")).toBeOnTheScreen();
    expect(screen.getByText("Cel puțin o literă mare")).toBeOnTheScreen();
  });

  it("CA-02.12: the button needs a 6-digit code and a valid password", async () => {
    await render(<ResetPasswordScreen />);
    expect(submitButton()).toBeDisabled();

    await fillForm("12345", "Parola123");
    expect(submitButton()).toBeDisabled();

    await fillForm("123456", "parola123");
    expect(submitButton()).toBeDisabled();

    await fillForm("123456", "Parola123");
    expect(submitButton()).toBeEnabled();
  });

  it("CA-02.12: changes the password and signs in with it", async () => {
    resetPassword.mockResolvedValue({ data: { success: true }, error: null });
    signInEmail.mockResolvedValue({ data: {}, error: null });
    await render(<ResetPasswordScreen />);

    await fillForm("123456", "Parola123");
    await fireEvent.press(submitButton());

    expect(resetPassword).toHaveBeenCalledWith({ email: "ana@example.com", otp: "123456", password: "Parola123" });
    expect(signInEmail).toHaveBeenCalledWith({ email: "ana@example.com", password: "Parola123" });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("CA-02.12: when the automatic sign-in fails, opens Intră în cont", async () => {
    resetPassword.mockResolvedValue({ data: { success: true }, error: null });
    signInEmail.mockResolvedValue({ data: null, error: { status: 429 } });
    await render(<ResetPasswordScreen />);

    await fillForm("123456", "Parola123");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Parola a fost schimbată", expect.any(String));
    expect(router.replace).toHaveBeenCalledWith("/sign-in");
  });

  it("CA-02.12: a wrong code shows Cod greșit, clears the code and keeps the password", async () => {
    resetPassword.mockResolvedValue({ data: null, error: { status: 400, code: "INVALID_OTP" } });
    await render(<ResetPasswordScreen />);

    await fillForm("000000", "Parola123");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith(
      "Cod greșit",
      "Codul nu se potrivește. Verifică emailul și scrie-l din nou.",
    );
    expect(signInEmail).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Cod de confirmare")).toHaveDisplayValue("");
    expect(screen.getByLabelText("Parolă nouă")).toHaveDisplayValue("Parola123");
  });

  it("CA-02.12: an expired code shows Codul a expirat", async () => {
    resetPassword.mockResolvedValue({ data: null, error: { status: 400, code: "OTP_EXPIRED" } });
    await render(<ResetPasswordScreen />);

    await fillForm("123456", "Parola123");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Codul a expirat", expect.any(String));
  });

  it("shows Parolă prea slabă when the server refuses the password", async () => {
    resetPassword.mockResolvedValue({ data: null, error: { status: 400, code: "PASSWORD_TOO_WEAK" } });
    await render(<ResetPasswordScreen />);

    await fillForm("123456", "Parola123");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Parolă prea slabă", expect.any(String));
  });

  it("CA-01.7: shows Serverul nu răspunde and keeps the typed data", async () => {
    resetPassword.mockRejectedValue(new TypeError("Network request failed"));
    await render(<ResetPasswordScreen />);

    await fillForm("123456", "Parola123");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
    expect(screen.getByLabelText("Cod de confirmare")).toHaveDisplayValue("123456");
    expect(screen.getByLabelText("Parolă nouă")).toHaveDisplayValue("Parola123");
  });

  it("counts down from 0:30, then Trimite un cod nou asks for a code and restarts the countdown", async () => {
    requestPasswordReset.mockResolvedValue({ data: { success: true }, error: null });
    await render(<ResetPasswordScreen />);
    expect(screen.getByText("Poți cere un cod nou în 0:30")).toBeOnTheScreen();

    await waitSeconds(30);
    await fireEvent.press(screen.getByText("Trimite un cod nou"));

    expect(requestPasswordReset).toHaveBeenCalledWith({ email: "ana@example.com" });
    expect(screen.getByText("Poți cere un cod nou în 0:30")).toBeOnTheScreen();
  });
});
