import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { AccountMenu, initialsOf } from "@/components/account-menu";

jest.mock("@/lib/profile-context", () => ({
  useProfile: () => ({ profile: { firstName: "Ana", lastName: "Popescu" } }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AccountMenu", () => {
  it("shows the initials of the user", async () => {
    await render(<AccountMenu />);

    expect(screen.getByText("AP")).toBeOnTheScreen();
  });

  it("opens Contul meu directly, without a menu in between", async () => {
    await render(<AccountMenu />);

    await fireEvent.press(screen.getByRole("button", { name: "Contul meu" }));

    expect(router.push).toHaveBeenCalledWith("/settings");
  });

  it("builds the initials from the first and last name", () => {
    expect(initialsOf("ana", "popescu")).toBe("AP");
    expect(initialsOf("Ana", null)).toBe("A");
  });
});
