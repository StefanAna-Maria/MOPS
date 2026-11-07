import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccountMenu } from "@/components/account-menu";
import { signOut } from "@/lib/sign-out";

jest.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { email: "ana@example.com" } } }) },
}));
jest.mock("@/lib/profile-context", () => ({
  useProfile: () => ({ profile: { firstName: "Ana", lastName: "Popescu" } }),
}));
jest.mock("@/lib/sign-out", () => ({ signOut: jest.fn().mockResolvedValue(undefined) }));

describe("AccountMenu", () => {
  it("shows the initials of the user", async () => {
    await render(<AccountMenu />);

    expect(screen.getByText("AP")).toBeOnTheScreen();
  });

  it("shows the name and the email in the menu", async () => {
    await render(<AccountMenu />);

    await fireEvent.press(screen.getByRole("button", { name: "Contul meu" }));

    expect(screen.getByText("Ana Popescu")).toBeOnTheScreen();
    expect(screen.getByText("ana@example.com")).toBeOnTheScreen();
  });

  it("CA-01.14: Deconectează-te signs the user out", async () => {
    await render(<AccountMenu />);

    await fireEvent.press(screen.getByRole("button", { name: "Contul meu" }));
    await fireEvent.press(screen.getByRole("button", { name: "Deconectează-te" }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
