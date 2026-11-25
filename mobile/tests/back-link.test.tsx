import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { BackLink } from "@/components/back-link";
import LanguageScreen from "@/app/(app)/language";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(async () => {}) }));

const canGoBackMock = router.canGoBack as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  canGoBackMock.mockReturnValue(true);
});

describe("Înapoi / Renunță", () => {
  it("closes the screen, like the back gesture, instead of opening the previous screen again", async () => {
    await render(<BackLink>Înapoi</BackLink>);

    await fireEvent.press(screen.getByRole("link", { name: "Înapoi" }));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("goes to Acasă when there is no screen to go back to", async () => {
    canGoBackMock.mockReturnValue(false);
    await render(<BackLink>Renunță</BackLink>);

    await fireEvent.press(screen.getByRole("link", { name: "Renunță" }));

    expect(router.replace).toHaveBeenCalledWith("/");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("Limba goes back to Contul meu by closing itself", async () => {
    await render(<LanguageScreen />);

    await fireEvent.press(screen.getByRole("link", { name: "Înapoi" }));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
