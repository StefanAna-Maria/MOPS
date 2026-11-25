import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { AccountMenu } from "@/components/account-menu";
import SettingsScreen from "@/app/(app)/settings";
import LanguageScreen from "@/app/(app)/language";
import HomeScreen from "@/app/(app)/index";
import { apiFetch } from "@/lib/api";
import { setLanguageSetting } from "@/i18n";
import { signOut } from "@/lib/sign-out";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(async () => {}) }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { email: "ana@example.com" } } }) },
}));
const mockCompany: { value: { name: string } | null } = { value: null };
jest.mock("@/lib/profile-context", () => ({
  useProfile: () => ({
    profile: { firstName: "Ana", lastName: "Popescu" },
    company: mockCompany.value,
    activeContext: "personal",
  }),
}));
jest.mock("@/lib/sign-out", () => ({ signOut: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/components/context-switcher", () => ({ ContextSwitcher: () => null }));

const apiFetchMock = apiFetch as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCompany.value = null;
  setLanguageSetting("auto");
});

afterAll(() => {
  setLanguageSetting("auto");
});

describe("Contul meu", () => {
  it("the circle with the initials opens Contul meu", async () => {
    await render(<AccountMenu />);

    await fireEvent.press(screen.getByRole("button", { name: "Contul meu" }));

    expect(router.push).toHaveBeenCalledWith("/settings");
  });

  it("shows who is signed in, the language and the app version", async () => {
    await render(<SettingsScreen />);

    expect(screen.getByText("Contul meu")).toBeOnTheScreen();
    expect(screen.getByText("AP")).toBeOnTheScreen();
    expect(screen.getByText("Ana Popescu")).toBeOnTheScreen();
    expect(screen.getByText("ana@example.com")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Limba: Automat (Română)" })).toBeOnTheScreen();
    expect(screen.getByText("1.0.0")).toBeOnTheScreen();
  });

  it("CA-02.15: Schimbă parola opens the form, without signing out", async () => {
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Schimbă parola" }));

    expect(router.push).toHaveBeenLastCalledWith("/change-password");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("CA-01.14: Deconectează-te signs the user out", async () => {
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Deconectează-te" }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("opens Limba and Adaugă firma", async () => {
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Limba: Automat (Română)" }));
    expect(router.push).toHaveBeenLastCalledWith("/language");

    await fireEvent.press(screen.getByRole("button", { name: "Adaugă firma" }));
    expect(router.push).toHaveBeenLastCalledWith("/add-company");
  });

  it("shows the company's name instead of Adaugă firma when there is one", async () => {
    mockCompany.value = { name: "Exemplu SRL" };

    await render(<SettingsScreen />);

    expect(screen.getByText("Exemplu SRL")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Adaugă firma" })).toBeNull();
  });
});

describe("Limba", () => {
  it("CA-17.2: offers Automat, Română and English, with Automat chosen by default", async () => {
    await render(<LanguageScreen />);

    expect(screen.getByRole("button", { name: /Automat/ })).toBeSelected();
    expect(screen.getByText("Română — limba telefonului")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Română" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "English" })).toBeOnTheScreen();
  });

  it("CA-17.2: choosing English changes the app at once and keeps the choice", async () => {
    await render(<LanguageScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "English" }));

    expect(screen.getByText("Language")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /English/ })).toBeSelected();
    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith("ocrinvoice_language", "en");
  });

  it("CA-17.3: in English, Acasă shows its texts and amounts in English", async () => {
    jest.useFakeTimers({ now: new Date(2026, 10, 21, 9, 0), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        month: "2026-11",
        documents: [
          {
            id: "1",
            context: "personal",
            type: "MANUAL",
            merchant: "eMAG",
            date: "2026-11-21",
            time: null,
            total: "4284.37",
            category: "SHOPPING",
            paymentMethod: "CARD",
            note: null,
            fileId: null,
            createdAt: "2026-11-21T08:00:00.000Z",
            lines: [],
          },
        ],
      }),
    });
    setLanguageSetting("en");

    await render(<HomeScreen />);

    expect(await screen.findByText("Good morning, Ana")).toBeOnTheScreen();
    expect(screen.getByText("TODAY")).toBeOnTheScreen();
    expect(screen.getAllByText("4,284.37 RON").length).toBeGreaterThan(0);
    expect(screen.getByText("Shopping · Manual expense")).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Invoices" })).toBeOnTheScreen();
    expect(screen.getByText("1 record")).toBeOnTheScreen();
    jest.useRealTimers();
  });
});
