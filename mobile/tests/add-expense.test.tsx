import { Alert } from "react-native";
import { router } from "expo-router";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import AddExpenseScreen from "@/app/(app)/add-expense";
import HomeScreen from "@/app/(app)/index";
import { apiFetch } from "@/lib/api";
import { EXPENSE_MESSAGES } from "@/lib/expense-messages";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/components/context-switcher", () => ({ ContextSwitcher: () => null }));
jest.mock("@/components/account-menu", () => ({ AccountMenu: () => null }));
const mockProfile = { activeContext: "personal" as "personal" | "company" };
jest.mock("@/lib/profile-context", () => ({
  useProfile: () => ({
    profile: { firstName: "Ana", lastName: "Popescu" },
    activeContext: mockProfile.activeContext,
    company: { id: "co1", name: "Exemplu SRL" },
  }),
}));

const apiFetchMock = apiFetch as unknown as jest.Mock;
const NOW = new Date(2026, 10, 14, 10, 0);

function addButton() {
  return screen.getByRole("button", { name: "Adaugă cheltuiala" });
}

async function fill(label: string, value: string) {
  const input = screen.getByLabelText(label);
  await fireEvent.changeText(input, value);
  await fireEvent(input, "blur");
}

async function fillValidForm() {
  await fill("Pentru ce ai plătit?", "  Piața Obor ");
  await fill("Sumă plătită", "12,5");
}

/**
 * Taps a Pressable synchronously through its accessibility click handler, so two taps can land
 * in the same frame, before React re-renders the button as disabled.
 */
function getPressHandler(element: { props: Record<string, unknown> }): () => void {
  const onClick = element.props.onClick as (event: unknown) => void;
  return () => onClick({ nativeEvent: {}, target: element, currentTarget: element });
}

function sentBody(call = 0) {
  return JSON.parse(apiFetchMock.mock.calls[call][1].body);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile.activeContext = "personal";
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Adaugă o cheltuială", () => {
  it("opens from the button on Acasă", async () => {
    await render(<HomeScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Adaugă o cheltuială" }));

    expect(router.push).toHaveBeenCalledWith("/add-expense");
  });

  it("starts with today's date, Altele and Numerar, and Adaugă cheltuiala disabled", async () => {
    await render(<AddExpenseScreen />);

    expect(screen.getByLabelText("Data plății")).toHaveDisplayValue("14.11.2026");
    expect(screen.getByRole("button", { name: "Categorie: Altele" })).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Numerar" })).toBeChecked();
    expect(addButton()).toBeDisabled();
  });

  it("CA-03.1 / CA-03.5: sends the expense to the server and goes back to Acasă", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ document: {} }) });
    await render(<AddExpenseScreen />);

    await fillValidForm();
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));
    await fireEvent.press(screen.getByRole("button", { name: "Alimente" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Card" }));
    await fireEvent.changeText(screen.getByLabelText("Notă (opțional)"), " legume ");
    await fireEvent.press(addButton());

    expect(apiFetchMock).toHaveBeenCalledWith("/api/documents/manual", expect.objectContaining({ method: "POST" }));
    expect(sentBody()).toEqual({
      clientRequestId: expect.any(String),
      context: "personal",
      description: "Piața Obor",
      amount: "12.50",
      date: "2026-11-14",
      category: "GROCERIES",
      paymentMethod: "CARD",
      note: "legume",
    });
    expect(router.back).toHaveBeenCalled();
  });

  it("CA-03.2: shows a message when Pentru ce is left empty", async () => {
    await render(<AddExpenseScreen />);

    expect(screen.queryByText(EXPENSE_MESSAGES.description)).toBeNull();
    await fill("Pentru ce ai plătit?", "   ");

    expect(screen.getByText(EXPENSE_MESSAGES.description)).toBeOnTheScreen();
  });

  it.each(["0", "-5", "12,345"])("CA-03.3: shows a message for the amount %s", async (amount) => {
    await render(<AddExpenseScreen />);

    await fill("Pentru ce ai plătit?", "Piață");
    await fill("Sumă plătită", amount);

    expect(screen.getByText(EXPENSE_MESSAGES.amount)).toBeOnTheScreen();
    expect(addButton()).toBeDisabled();
  });

  it.each(["12,5", "12.50"])("CA-03.3: accepts the amount %s", async (amount) => {
    await render(<AddExpenseScreen />);

    await fill("Pentru ce ai plătit?", "Piață");
    await fill("Sumă plătită", amount);

    expect(screen.queryByText(EXPENSE_MESSAGES.amount)).toBeNull();
    expect(addButton()).toBeEnabled();
  });

  it.each(["15.11.2026", "31.02.2026", "2026-11-14"])("CA-03.4: shows a message for the date %s", async (date) => {
    await render(<AddExpenseScreen />);

    await fillValidForm();
    await fill("Data plății", date);

    expect(screen.getByText(EXPENSE_MESSAGES.date)).toBeOnTheScreen();
    expect(addButton()).toBeDisabled();
  });

  it("CA-03.6: two quick taps send the expense only once", async () => {
    let resolve: (value: unknown) => void = () => {};
    apiFetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    await render(<AddExpenseScreen />);

    await fillValidForm();
    // Both taps land in the same frame, before React re-renders the button as disabled.
    const button = addButton();
    await act(async () => {
      const onPress = getPressHandler(button);
      onPress();
      onPress();
      resolve({ ok: true, status: 201, json: async () => ({ document: {} }) });
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("CA-03.6: a retry after the server did not answer reuses the same request id", async () => {
    apiFetchMock
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ document: {} }) });
    await render(<AddExpenseScreen />);

    await fillValidForm();
    await fireEvent.press(addButton());
    expect(Alert.alert).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
    expect(screen.getByLabelText("Pentru ce ai plătit?")).toHaveDisplayValue("  Piața Obor ");

    await fireEvent.press(addButton());

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(1).clientRequestId).toBe(sentBody(0).clientRequestId);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("shows an alert and stays on the form when the server refuses the expense", async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: "INVALID_EXPENSE", fields: ["date"] }),
    });
    await render(<AddExpenseScreen />);

    await fillValidForm();
    await fireEvent.press(addButton());

    expect(Alert.alert).toHaveBeenCalledWith("Nu am putut salva cheltuiala", expect.any(String));
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe("Adaugă o cheltuială - profilul", () => {
  beforeEach(() => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ document: {} }) });
  });

  it("saves in the personal profile and says so", async () => {
    await render(<AddExpenseScreen />);

    expect(screen.getByText(/Se salvează în: Personal\./)).toBeOnTheScreen();
    await fillValidForm();
    await fireEvent.press(addButton());

    expect(sentBody().context).toBe("personal");
  });

  it("saves in the company when the company profile is selected", async () => {
    mockProfile.activeContext = "company";
    await render(<AddExpenseScreen />);

    expect(screen.getByText(/Se salvează în: Exemplu SRL\./)).toBeOnTheScreen();
    await fillValidForm();
    await fireEvent.press(addButton());

    expect(sentBody().context).toBe("company");
  });
});
