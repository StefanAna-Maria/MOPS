import { Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import OnboardingNameScreen from "@/app/onboarding-name";
import { apiFetch } from "@/lib/api";

const mockSetProfile = jest.fn();

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/profile-context", () => ({
  useProfile: () => ({ setProfile: mockSetProfile }),
}));

const apiFetchMock = apiFetch as unknown as jest.Mock;

function continueButton() {
  return screen.getByRole("button", { name: "Continuă" });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("Cum te numești?", () => {
  it("CA-01.17: shows the Cum te numești? screen", async () => {
    await render(<OnboardingNameScreen />);

    expect(screen.getByText("Cum te numești?")).toBeOnTheScreen();
  });

  it("CA-01.17: Continuă is disabled while the names are empty", async () => {
    await render(<OnboardingNameScreen />);

    expect(continueButton()).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText("Prenume"), "Ana");
    expect(continueButton()).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText("Nume"), "   ");
    expect(continueButton()).toBeDisabled();
  });

  it("CA-01.17: Continuă is enabled with a first and a last name", async () => {
    await render(<OnboardingNameScreen />);

    await fireEvent.changeText(screen.getByLabelText("Prenume"), "Ana");
    await fireEvent.changeText(screen.getByLabelText("Nume"), "Popescu");

    expect(continueButton()).toBeEnabled();
  });

  it("CA-01.19: saves the trimmed name on the server", async () => {
    const profile = { id: "p1", userId: "u1", firstName: "Ana", lastName: "Popescu", personalEnabled: true };
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ profile }) });
    await render(<OnboardingNameScreen />);

    await fireEvent.changeText(screen.getByLabelText("Prenume"), "  Ana ");
    await fireEvent.changeText(screen.getByLabelText("Nume"), " Popescu ");
    await fireEvent.press(continueButton());

    expect(apiFetchMock).toHaveBeenCalledWith("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ firstName: "Ana", lastName: "Popescu" }),
    });
    expect(mockSetProfile).toHaveBeenCalledWith(profile);
  });

  it("shows an alert when the server refuses the name", async () => {
    apiFetchMock.mockResolvedValue({ ok: false, json: async () => ({ code: "INVALID_NAME" }) });
    await render(<OnboardingNameScreen />);

    await fireEvent.changeText(screen.getByLabelText("Prenume"), "Ana");
    await fireEvent.changeText(screen.getByLabelText("Nume"), "Popescu");
    await fireEvent.press(continueButton());

    expect(Alert.alert).toHaveBeenCalledWith("Nu am putut salva numele", expect.any(String));
    expect(mockSetProfile).not.toHaveBeenCalled();
  });

  it("CA-01.7: shows Serverul nu răspunde when the server does not answer", async () => {
    apiFetchMock.mockRejectedValue(new Error("Aborted"));
    await render(<OnboardingNameScreen />);

    await fireEvent.changeText(screen.getByLabelText("Prenume"), "Ana");
    await fireEvent.changeText(screen.getByLabelText("Nume"), "Popescu");
    await fireEvent.press(continueButton());

    expect(Alert.alert).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
    expect(screen.getByLabelText("Prenume")).toHaveDisplayValue("Ana");
  });
});
