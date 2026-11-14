import { Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import ForgotPasswordScreen from "@/app/(auth)/forgot-password";
import { authClient } from "@/lib/auth-client";

jest.mock("@/lib/auth-client", () => ({
  authClient: { emailOtp: { requestPasswordReset: jest.fn() } },
}));

const requestPasswordReset = authClient.emailOtp.requestPasswordReset as unknown as jest.Mock;

function sendButton() {
  return screen.getByRole("button", { name: "Trimite codul" });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("Ai uitat parola?", () => {
  it("CA-02.11: the button is active only with a valid email", async () => {
    await render(<ForgotPasswordScreen />);
    expect(sendButton()).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText("Email"), "ana@");
    expect(sendButton()).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText("Email"), "ana@example.com");
    expect(sendButton()).toBeEnabled();
  });

  it("CA-02.11: asks for a code and opens the next screen with the email", async () => {
    requestPasswordReset.mockResolvedValue({ data: { success: true }, error: null });
    await render(<ForgotPasswordScreen />);

    await fireEvent.changeText(screen.getByLabelText("Email"), "  Ana@Example.com ");
    await fireEvent.press(sendButton());

    expect(requestPasswordReset).toHaveBeenCalledWith({ email: "ana@example.com" });
    expect(router.push).toHaveBeenCalledWith({ pathname: "/reset-password", params: { email: "ana@example.com" } });
  });

  it("CA-02.13: shows no sign of whether the address has an account (same step either way)", async () => {
    requestPasswordReset.mockResolvedValue({ data: { success: true }, error: null });
    await render(<ForgotPasswordScreen />);

    await fireEvent.changeText(screen.getByLabelText("Email"), "necunoscut@example.com");
    await fireEvent.press(sendButton());

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("shows Prea multe încercări when the server limits requests", async () => {
    requestPasswordReset.mockResolvedValue({ data: null, error: { status: 429 } });
    await render(<ForgotPasswordScreen />);

    await fireEvent.changeText(screen.getByLabelText("Email"), "ana@example.com");
    await fireEvent.press(sendButton());

    expect(Alert.alert).toHaveBeenCalledWith("Prea multe încercări", expect.any(String));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("CA-01.7: shows Serverul nu răspunde and keeps the typed email", async () => {
    requestPasswordReset.mockRejectedValue(new TypeError("Network request failed"));
    await render(<ForgotPasswordScreen />);

    await fireEvent.changeText(screen.getByLabelText("Email"), "ana@example.com");
    await fireEvent.press(sendButton());

    expect(Alert.alert).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
    expect(screen.getByLabelText("Email")).toHaveDisplayValue("ana@example.com");
    expect(router.push).not.toHaveBeenCalled();
  });
});
