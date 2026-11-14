import { Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import ChangePasswordScreen from "@/app/(app)/change-password";
import { authClient } from "@/lib/auth-client";

jest.mock("@/lib/auth-client", () => ({
  authClient: { changePassword: jest.fn() },
}));

const changePassword = authClient.changePassword as unknown as jest.Mock;

function submitButton() {
  return screen.getByRole("button", { name: "Schimbă parola" });
}

async function fillForm(current: string, next: string, confirmation: string) {
  await fireEvent.changeText(screen.getByLabelText("Parola curentă"), current);
  await fireEvent.changeText(screen.getByLabelText("Parola nouă"), next);
  await fireEvent.changeText(screen.getByLabelText("Confirmare parola nouă"), confirmation);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("Schimbă parola", () => {
  it("CA-02.15: shows the three fields", async () => {
    await render(<ChangePasswordScreen />);

    expect(screen.getByLabelText("Parola curentă")).toBeOnTheScreen();
    expect(screen.getByLabelText("Parola nouă")).toBeOnTheScreen();
    expect(screen.getByLabelText("Confirmare parola nouă")).toBeOnTheScreen();
  });

  it("shows the three password rules", async () => {
    await render(<ChangePasswordScreen />);

    expect(screen.getByText("Cel puțin 8 caractere")).toBeOnTheScreen();
    expect(screen.getByText("Cel puțin o cifră")).toBeOnTheScreen();
    expect(screen.getByText("Cel puțin o literă mare")).toBeOnTheScreen();
  });

  it("CA-02.16: the button is active only with all fields valid and matching", async () => {
    await render(<ChangePasswordScreen />);
    expect(submitButton()).toBeDisabled();

    await fillForm("", "NouaParola9", "NouaParola9");
    expect(submitButton()).toBeDisabled();

    await fillForm("Parola123", "noua", "noua");
    expect(submitButton()).toBeDisabled();

    await fillForm("Parola123", "NouaParola9", "NouaParola8");
    expect(submitButton()).toBeDisabled();

    await fillForm("Parola123", "NouaParola9", "NouaParola9");
    expect(submitButton()).toBeEnabled();
  });

  it("CA-02.16: changes the password and shows the success screen", async () => {
    changePassword.mockResolvedValue({ data: { token: "t" }, error: null });
    await render(<ChangePasswordScreen />);

    await fillForm("Parola123", "NouaParola9", "NouaParola9");
    await fireEvent.press(submitButton());

    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "Parola123",
      newPassword: "NouaParola9",
      revokeOtherSessions: true,
    });
    expect(screen.getByText("Parola a fost schimbată cu succes!")).toBeOnTheScreen();
    expect(screen.getByText("Celelalte dispozitive au fost deconectate.")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Parola curentă")).not.toBeOnTheScreen();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("CA-02.16: Revino în aplicație goes back to the app", async () => {
    changePassword.mockResolvedValue({ data: { token: "t" }, error: null });
    await render(<ChangePasswordScreen />);
    await fillForm("Parola123", "NouaParola9", "NouaParola9");
    await fireEvent.press(submitButton());
    expect(router.back).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Revino în aplicație" }));

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("the success screen is not shown when the change fails", async () => {
    changePassword.mockResolvedValue({ data: null, error: { status: 400, code: "INVALID_PASSWORD" } });
    await render(<ChangePasswordScreen />);

    await fillForm("Gresita123", "NouaParola9", "NouaParola9");
    await fireEvent.press(submitButton());

    expect(screen.queryByText("Parola a fost schimbată cu succes!")).not.toBeOnTheScreen();
  });

  it("CA-02.17: shows Parolele nu coincid when the confirmation differs", async () => {
    await render(<ChangePasswordScreen />);

    await fillForm("Parola123", "NouaParola9", "NouaParola8");

    expect(screen.getByText("Parolele nu coincid.")).toBeOnTheScreen();
  });

  it("CA-02.17: no mismatch message while the confirmation is empty or equal", async () => {
    await render(<ChangePasswordScreen />);
    expect(screen.queryByText("Parolele nu coincid.")).not.toBeOnTheScreen();

    await fillForm("Parola123", "NouaParola9", "NouaParola9");
    expect(screen.queryByText("Parolele nu coincid.")).not.toBeOnTheScreen();
  });

  it("CA-02.17: a wrong current password shows a specific message and stays on the form", async () => {
    changePassword.mockResolvedValue({ data: null, error: { status: 400, code: "INVALID_PASSWORD" } });
    await render(<ChangePasswordScreen />);

    await fillForm("Gresita123", "NouaParola9", "NouaParola9");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Parola curentă este greșită", expect.any(String));
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Parola nouă")).toHaveDisplayValue("NouaParola9");
  });

  it("CA-02.17: shows Parolă prea slabă when the server refuses the new password", async () => {
    changePassword.mockResolvedValue({ data: null, error: { status: 400, code: "PASSWORD_TOO_WEAK" } });
    await render(<ChangePasswordScreen />);

    await fillForm("Parola123", "NouaParola9", "NouaParola9");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Parolă prea slabă", expect.any(String));
    expect(router.back).not.toHaveBeenCalled();
  });

  it("shows Prea multe încercări when the server limits requests", async () => {
    changePassword.mockResolvedValue({ data: null, error: { status: 429 } });
    await render(<ChangePasswordScreen />);

    await fillForm("Parola123", "NouaParola9", "NouaParola9");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Prea multe încercări", expect.any(String));
  });

  it("CA-02.22: shows Serverul nu răspunde and keeps all three fields filled", async () => {
    changePassword.mockRejectedValue(new TypeError("Network request failed"));
    await render(<ChangePasswordScreen />);

    await fillForm("Parola123", "NouaParola9", "NouaParola9");
    await fireEvent.press(submitButton());

    expect(Alert.alert).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
    expect(screen.getByLabelText("Parola curentă")).toHaveDisplayValue("Parola123");
    expect(screen.getByLabelText("Parola nouă")).toHaveDisplayValue("NouaParola9");
    expect(screen.getByLabelText("Confirmare parola nouă")).toHaveDisplayValue("NouaParola9");
    expect(screen.queryByText("Parola a fost schimbată cu succes!")).not.toBeOnTheScreen();
  });
});
