import { render, screen } from "@testing-library/react-native";
import HomeScreen from "@/app/(app)/index";

jest.mock("@/components/context-switcher", () => ({ ContextSwitcher: () => null }));
jest.mock("@/components/account-menu", () => ({ AccountMenu: () => null }));
jest.mock("@/lib/profile-context", () => ({
  useProfile: () => ({ profile: { firstName: "Ana", lastName: "Popescu" } }),
}));

afterEach(() => {
  jest.useRealTimers();
});

describe("Acasă", () => {
  it.each([
    [9, "Bună dimineața, Ana"],
    [14, "Bună ziua, Ana"],
    [21, "Bună seara, Ana"],
  ])("CA-01.18: at %i:00 shows %s", async (hour, greeting) => {
    jest.useFakeTimers({ now: new Date(2026, 10, 7, hour, 0) });

    await render(<HomeScreen />);

    expect(screen.getByText(greeting)).toBeOnTheScreen();
  });

  it("shows the app name in the header", async () => {
    await render(<HomeScreen />);

    expect(screen.getByText("OCRInvoice")).toBeOnTheScreen();
  });
});
