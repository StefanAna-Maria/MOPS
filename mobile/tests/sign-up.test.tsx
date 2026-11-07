import { Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import SignUpScreen from "@/app/(auth)/sign-up";
import { authClient } from "@/lib/auth-client";

jest.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: jest.fn() } },
}));

const signUpEmail = authClient.signUp.email as unknown as jest.Mock;

async function fillForm(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.changeText(screen.getByLabelText("Parolă"), password);
}

function submitButton() {
  return screen.getByRole("button", { name: "Creează cont" });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("Creează cont", () => {
  it("CA-01.1: shows the three password rules", async () => {
    await render(<SignUpScreen />);

    expect(screen.getByText("Cel puțin 8 caractere")).toBeOnTheScreen();
    expect(screen.getByText("Cel puțin o cifră")).toBeOnTheScreen();
    expect(screen.getByText("Cel puțin o literă mare")).toBeOnTheScreen();
  });

  it("CA-01.1: ticks the rules while the password is typed", async () => {
    await render(<SignUpScreen />);
    expect(screen.queryAllByText("✓")).toHaveLength(0);

    await fireEvent.changeText(screen.getByLabelText("Parolă"), "abcdefgh");
    expect(screen.queryAllByText("✓")).toHaveLength(1);

    await fireEvent.changeText(screen.getByLabelText("Parolă"), "abcdefg1");
    expect(screen.queryAllByText("✓")).toHaveLength(2);

    await fireEvent.changeText(screen.getByLabelText("Parolă"), "Abcdefg1");
    expect(screen.queryAllByText("✓")).toHaveLength(3);
  });

  it("CA-01.2: the button is disabled while the form is empty", async () => {
    await render(<SignUpScreen />);

    expect(submitButton()).toBeDisabled();
  });

  it("CA-01.2: the button is disabled with an invalid email", async () => {
    await render(<SignUpScreen />);

    await fillForm("ana@", "Parola123");

    expect(submitButton()).toBeDisabled();
  });

  it("CA-01.2: the button is disabled with a password that breaks a rule", async () => {
    await render(<SignUpScreen />);

    await fillForm("ana@example.com", "parola123");

    expect(submitButton()).toBeDisabled();
  });

  it("CA-01.2: the button is enabled with a valid email and password", async () => {
    await render(<SignUpScreen />);

    await fillForm("ana@example.com", "Parola123");

    expect(submitButton()).toBeEnabled();
  });

  it("CA-01.3: creates the account and opens Verifică-ți emailul", async () => {
    signUpEmail.mockResolvedValue({ data: {}, error: null });
    await render(<SignUpScreen />);

    await fillForm("  Ana@Example.com ", "Parola123");
    await fireEvent.press(submitButton());

    expect(signUpEmail).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "Parola123",
      name: "",
      usageType: "PERSONAL",
    });
    expect(router.push).toHaveBeenCalledWith({ pathname: "/verify-email", params: { email: "ana@example.com" } });
  });

  it("sends COMPANY when Firmă is selected", async () => {
    signUpEmail.mockResolvedValue({ data: {}, error: null });
    await render(<SignUpScreen />);

    await fillForm("ana@example.com", "Parola123");
    await fireEvent.press(screen.getByRole("radio", { name: "Firmă" }));
    await fireEvent.press(submitButton());

    expect(signUpEmail).toHaveBeenCalledWith(expect.objectContaining({ usageType: "COMPANY" }));
  });

  it("CA-01.4: shows an alert when the server answers PASSWORD_TOO_WEAK", async () => {
    signUpEmail.mockResolvedValue({ data: null, error: { status: 400, code: "PASSWORD_TOO_WEAK" } });
    await render(<SignUpScreen />);

    await fillForm("ana@example.com", "Parola123");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Parolă prea slabă", expect.any(String));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("CA-01.7: shows Serverul nu răspunde and keeps the typed data", async () => {
    signUpEmail.mockRejectedValue(new TypeError("Network request failed"));
    await render(<SignUpScreen />);

    await fillForm("ana@example.com", "Parola123");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
    expect(screen.getByLabelText("Email")).toHaveDisplayValue("ana@example.com");
    expect(screen.getByLabelText("Parolă")).toHaveDisplayValue("Parola123");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("CA-01.11: shows Prea multe încercări when the server limits requests", async () => {
    signUpEmail.mockResolvedValue({ data: null, error: { status: 429 } });
    await render(<SignUpScreen />);

    await fillForm("ana@example.com", "Parola123");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Prea multe încercări", expect.any(String));
  });
});
