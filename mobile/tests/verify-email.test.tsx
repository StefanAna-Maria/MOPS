import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import VerifyEmailScreen from "@/app/(auth)/verify-email";
import { authClient } from "@/lib/auth-client";

jest.mock("@/lib/auth-client", () => ({
  authClient: { emailOtp: { verifyEmail: jest.fn(), sendVerificationOtp: jest.fn() } },
}));

const verifyEmail = authClient.emailOtp.verifyEmail as unknown as jest.Mock;
const sendVerificationOtp = authClient.emailOtp.sendVerificationOtp as unknown as jest.Mock;

function confirmButton() {
  return screen.getByRole("button", { name: "Confirmă" });
}

async function typeCode(code: string) {
  await fireEvent.changeText(screen.getByLabelText("Cod de confirmare"), code);
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

describe("Verifică-ți emailul", () => {
  it("CA-02.2: shows the address the code was sent to", async () => {
    await render(<VerifyEmailScreen />);

    expect(screen.getByText("Am trimis un cod de 6 cifre la ana@example.com.")).toBeOnTheScreen();
  });

  it("CA-02.2: shows six boxes", async () => {
    await render(<VerifyEmailScreen />);
    await typeCode("123");

    expect(screen.getByText("1")).toBeOnTheScreen();
    expect(screen.getByText("2")).toBeOnTheScreen();
    expect(screen.getByText("3")).toBeOnTheScreen();
  });

  it("CA-02.2: Confirmă is disabled until six digits are typed", async () => {
    await render(<VerifyEmailScreen />);
    expect(confirmButton()).toBeDisabled();

    await typeCode("12345");
    expect(confirmButton()).toBeDisabled();

    await typeCode("123456");
    expect(confirmButton()).toBeEnabled();
  });

  it("CA-02.2: only digits are accepted, at most six", async () => {
    await render(<VerifyEmailScreen />);

    await typeCode("12a34b56789");

    expect(screen.getByLabelText("Cod de confirmare")).toHaveDisplayValue("123456");
  });

  it("CA-02.3: sends the email and the code to the server", async () => {
    verifyEmail.mockResolvedValue({ data: { status: true }, error: null });
    await render(<VerifyEmailScreen />);

    await typeCode("123456");
    await fireEvent.press(confirmButton());

    expect(verifyEmail).toHaveBeenCalledWith({ email: "ana@example.com", otp: "123456" });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("CA-02.4: a wrong code shows Cod greșit and clears the boxes", async () => {
    verifyEmail.mockResolvedValue({ data: null, error: { status: 400, code: "INVALID_OTP" } });
    await render(<VerifyEmailScreen />);

    await typeCode("000000");
    await fireEvent.press(confirmButton());

    expect(Alert.alert).toHaveBeenCalledWith(
      "Cod greșit",
      "Codul nu se potrivește. Verifică emailul și scrie-l din nou.",
    );
    expect(screen.getByLabelText("Cod de confirmare")).toHaveDisplayValue("");
  });

  it("CA-02.5: an expired code shows Codul a expirat", async () => {
    verifyEmail.mockResolvedValue({ data: null, error: { status: 400, code: "OTP_EXPIRED" } });
    await render(<VerifyEmailScreen />);

    await typeCode("123456");
    await fireEvent.press(confirmButton());

    expect(Alert.alert).toHaveBeenCalledWith("Codul a expirat", expect.any(String));
  });

  it("shows Prea multe încercări when the code is blocked or the server limits requests", async () => {
    verifyEmail.mockResolvedValueOnce({ data: null, error: { status: 403, code: "TOO_MANY_ATTEMPTS" } });
    verifyEmail.mockResolvedValueOnce({ data: null, error: { status: 429 } });
    await render(<VerifyEmailScreen />);

    await typeCode("123456");
    await fireEvent.press(confirmButton());
    await typeCode("123456");
    await fireEvent.press(confirmButton());

    expect(Alert.alert).toHaveBeenCalledTimes(2);
    expect(Alert.alert).toHaveBeenNthCalledWith(1, "Prea multe încercări", expect.any(String));
    expect(Alert.alert).toHaveBeenNthCalledWith(2, "Prea multe încercări", expect.any(String));
  });

  it("CA-01.7: shows Serverul nu răspunde when the server is down", async () => {
    verifyEmail.mockRejectedValue(new TypeError("Network request failed"));
    await render(<VerifyEmailScreen />);

    await typeCode("123456");
    await fireEvent.press(confirmButton());

    expect(Alert.alert).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
  });

  it("CA-02.6: counts down from 0:30 and then offers a new code", async () => {
    await render(<VerifyEmailScreen />);
    expect(screen.getByText("Poți cere un cod nou în 0:30")).toBeOnTheScreen();
    expect(screen.queryByText("Trimite un cod nou")).not.toBeOnTheScreen();

    await waitSeconds(5);
    expect(screen.getByText("Poți cere un cod nou în 0:25")).toBeOnTheScreen();

    await waitSeconds(25);
    expect(screen.queryByText(/Poți cere un cod nou/)).not.toBeOnTheScreen();
    expect(screen.getByText("Trimite un cod nou")).toBeOnTheScreen();
  });

  it("CA-02.6: Trimite un cod nou asks the server for a code and restarts the countdown", async () => {
    sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null });
    await render(<VerifyEmailScreen />);
    await waitSeconds(30);

    await fireEvent.press(screen.getByText("Trimite un cod nou"));

    expect(sendVerificationOtp).toHaveBeenCalledWith({ email: "ana@example.com", type: "email-verification" });
    expect(screen.getByText("Poți cere un cod nou în 0:30")).toBeOnTheScreen();
  });

  it("CA-02.6: the countdown does not restart when the new code could not be sent", async () => {
    sendVerificationOtp.mockResolvedValue({ data: null, error: { status: 500 } });
    await render(<VerifyEmailScreen />);
    await waitSeconds(30);

    await fireEvent.press(screen.getByText("Trimite un cod nou"));

    expect(Alert.alert).toHaveBeenCalledWith("Nu am putut trimite codul", expect.any(String));
    expect(screen.getByText("Trimite un cod nou")).toBeOnTheScreen();
  });

  it("has a link back to Intră în cont", async () => {
    await render(<VerifyEmailScreen />);

    expect(screen.getByText("Înapoi la „Intră în cont”")).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });
});
