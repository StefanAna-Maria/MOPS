import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ExpenseDocument } from "@ocrinvoice/shared";
import EditDocumentScreen from "@/app/(app)/edit-document/[id]";
import { apiFetch } from "@/lib/api";
import { DOCUMENT_MESSAGES, EDIT_MESSAGES, EXPENSE_MESSAGES, HOME_MESSAGES } from "@/lib/expense-messages";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
// US-03: the form loads the user's categories; here they come from this list.
const mockFetchCategories = jest.fn();
jest.mock("@/lib/categories", () => ({
  ...jest.requireActual("@/lib/categories"),
  fetchCategories: () => mockFetchCategories(),
}));

const apiFetchMock = apiFetch as unknown as jest.Mock;
const paramsMock = useLocalSearchParams as unknown as jest.Mock;
const NOW = new Date(2026, 10, 14, 10, 0);

const manual: ExpenseDocument = {
  id: "doc-1",
  context: "personal",
  type: "MANUAL",
  merchant: "Farmacia Tei",
  date: "2026-11-05",
  time: null,
  total: "1234.50",
  category: "HEALTH",
  categoryName: "Sănătate",
  paymentMethod: "TRANSFER",
  note: "rețetă compensată",
  fileId: null,
  createdAt: "2026-11-05T10:00:00.000Z",
  lines: [{ id: "l1", position: 1, name: "Farmacia Tei", amount: "1234.50", category: "HEALTH" }],
};

const scanned: ExpenseDocument = {
  ...manual,
  id: "doc-2",
  type: "SCANNED",
  merchant: "Carrefour Express",
  time: "17:58",
  total: "26.17",
  category: "GROCERIES",
  categoryName: "Alimente",
  paymentMethod: "CARD",
  note: null,
  fileId: "file-1",
  lines: [
    { id: "l1", position: 1, name: "Pâine", amount: "10.00", category: "GROCERIES" },
    { id: "l2", position: 2, name: "Lapte", amount: "16.17", category: "GROCERIES" },
  ],
};

function respond(status: number, body: unknown) {
  apiFetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
}

function saveButton() {
  return screen.getByRole("button", { name: EDIT_MESSAGES.save });
}

async function fill(label: string, value: string) {
  const input = screen.getByLabelText(label);
  await fireEvent.changeText(input, value);
  await fireEvent(input, "blur");
}

async function openEditor(document: ExpenseDocument = manual) {
  paramsMock.mockReturnValue({ id: document.id });
  respond(200, { document });
  await render(<EditDocumentScreen />);
}

function sentBody() {
  const save = apiFetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
  return JSON.parse(save?.[1].body);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchCategories.mockImplementation(async () => jest.requireActual("@/lib/categories").BUILT_IN_CATEGORIES);
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Editarea unui document (US-13)", () => {
  it("loads the document by its id", async () => {
    await openEditor();

    expect(apiFetchMock).toHaveBeenCalledWith("/api/documents/doc-1");
  });

  it("CA-13.1: shows the saved values in the fields", async () => {
    await openEditor();

    expect(await screen.findByLabelText("Pentru ce ai plătit?")).toHaveDisplayValue("Farmacia Tei");
    expect(screen.getByLabelText("Sumă plătită")).toHaveDisplayValue("1234,50");
    expect(screen.getByRole("button", { name: "Data plății: 05.11.2026" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Categorie: Sănătate" })).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Transfer" })).toBeChecked();
    expect(screen.getByLabelText("Notă (opțional)")).toHaveDisplayValue("rețetă compensată");
    expect(saveButton()).toBeEnabled();
  });

  it("CA-13.1: a scanned document asks for the Magazin and says its products stay as they were read", async () => {
    await openEditor(scanned);

    expect(await screen.findByLabelText("Magazin")).toHaveDisplayValue("Carrefour Express");
    expect(screen.getByText(/Produsele rămân așa cum au fost citite/)).toBeOnTheScreen();
    expect(screen.getByLabelText("Notă (opțional)")).toHaveDisplayValue("");
    expect(screen.getByRole("radio", { name: "Card" })).toBeChecked();
  });

  it("CA-13.1: sends every corrected field to the server and goes back", async () => {
    await openEditor();
    await screen.findByLabelText("Pentru ce ai plătit?");
    respond(200, { document: manual });

    await fill("Pentru ce ai plătit?", "  Farmacia Catena ");
    await fill("Sumă plătită", "99,9");
    await fireEvent.press(screen.getByRole("button", { name: "Data plății: 05.11.2026" }));
    await fireEvent(screen.getByTestId("date-time-picker"), "onChange", { type: "set" }, new Date(2026, 10, 3));
    await fireEvent.press(screen.getByRole("button", { name: "Gata" }));
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Sănătate" }));
    await fireEvent.press(screen.getByRole("button", { name: "Alimente" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Card" }));
    await fireEvent.changeText(screen.getByLabelText("Notă (opțional)"), " corectat ");
    await fireEvent.press(saveButton());

    expect(apiFetchMock).toHaveBeenCalledWith("/api/documents/doc-1", expect.objectContaining({ method: "PATCH" }));
    expect(sentBody()).toEqual({
      merchant: "Farmacia Catena",
      amount: "99.90",
      date: "2026-11-03",
      category: "GROCERIES",
      paymentMethod: "CARD",
      note: "corectat",
    });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("CA-13.1: saves the values unchanged when nothing was edited (the date stays valid)", async () => {
    await openEditor();
    await screen.findByLabelText("Pentru ce ai plătit?");
    respond(200, { document: manual });

    await fireEvent.press(saveButton());

    expect(sentBody()).toEqual({
      merchant: "Farmacia Tei",
      amount: "1234.50",
      date: "2026-11-05",
      category: "HEALTH",
      paymentMethod: "TRANSFER",
      note: "rețetă compensată",
    });
  });

  it("CA-13.1: an emptied note is sent empty, so the note is removed", async () => {
    await openEditor();
    await screen.findByLabelText("Pentru ce ai plătit?");
    respond(200, { document: manual });

    await fireEvent.changeText(screen.getByLabelText("Notă (opțional)"), "   ");
    await fireEvent.press(saveButton());

    expect(sentBody().note).toBe("");
  });

  it("CA-13.1: shows the same message as when adding when the merchant is emptied", async () => {
    await openEditor();
    await screen.findByLabelText("Pentru ce ai plătit?");

    expect(screen.queryByText(EXPENSE_MESSAGES.description)).toBeNull();
    await fill("Pentru ce ai plătit?", "   ");

    expect(screen.getByText(EXPENSE_MESSAGES.description)).toBeOnTheScreen();
    expect(saveButton()).toBeDisabled();
  });

  it.each(["0", "-5", "12,345", "abc", ""])("CA-13.1: refuses the amount %j, like when adding", async (amount) => {
    await openEditor();
    await screen.findByLabelText("Sumă plătită");

    await fill("Sumă plătită", amount);

    expect(screen.getByText(EXPENSE_MESSAGES.amount)).toBeOnTheScreen();
    expect(saveButton()).toBeDisabled();
  });

  it.each(["12,5", "12.50", "1000"])("CA-13.1: accepts the amount %s, like when adding", async (amount) => {
    await openEditor();
    await screen.findByLabelText("Sumă plătită");

    await fill("Sumă plătită", amount);

    expect(screen.queryByText(EXPENSE_MESSAGES.amount)).toBeNull();
    expect(saveButton()).toBeEnabled();
  });

  it("CA-13.1: the date is picked in a calendar that does not allow a date after today", async () => {
    await openEditor();
    await screen.findByLabelText("Sumă plătită");

    await fireEvent.press(screen.getByRole("button", { name: "Data plății: 05.11.2026" }));

    const calendar = screen.getByTestId("date-time-picker");
    expect(calendar.props.mode).toBe("date");
    expect((calendar.props.maximumDate as Date).toDateString()).toBe(NOW.toDateString());
  });

  it("CA-13.1: a document whose date is in the future cannot be saved until the date is corrected", async () => {
    await openEditor({ ...manual, date: "2026-12-01" });
    await screen.findByLabelText("Sumă plătită");

    expect(saveButton()).toBeDisabled();
  });

  it("CA-13.1: a payment method the app does not know falls back to Numerar", async () => {
    await openEditor({ ...manual, paymentMethod: "VOUCHER" });
    await screen.findByLabelText("Sumă plătită");

    expect(screen.getByRole("radio", { name: "Numerar" })).toBeChecked();
  });

  it("two quick taps save the correction only once", async () => {
    await openEditor();
    await screen.findByLabelText("Pentru ce ai plătit?");
    let resolve: (value: unknown) => void = () => {};
    apiFetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));

    const button = saveButton();
    await act(async () => {
      const onClick = button.props.onClick as (event: unknown) => void;
      const press = () => onClick({ nativeEvent: {}, target: button, currentTarget: button });
      press();
      press();
      resolve({ ok: true, status: 200, json: async () => ({ document: manual }) });
    });

    expect(apiFetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("shows a message and stays on the form when the server refuses the values", async () => {
    await openEditor();
    await screen.findByLabelText("Pentru ce ai plătit?");
    respond(400, { code: "INVALID_EXPENSE", fields: ["amount"] });

    await fireEvent.press(saveButton());

    expect(Alert.alert).toHaveBeenCalledWith(EDIT_MESSAGES.saveFailedTitle, EDIT_MESSAGES.saveFailed);
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Pentru ce ai plătit?")).toHaveDisplayValue("Farmacia Tei");
  });

  it("CA-01.7: shows Serverul nu răspunde and keeps what was typed when the server does not answer", async () => {
    await openEditor();
    await screen.findByLabelText("Pentru ce ai plătit?");
    await fill("Pentru ce ai plătit?", "Corectat");
    apiFetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));

    await fireEvent.press(saveButton());

    expect(Alert.alert).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
    expect(screen.getByLabelText("Pentru ce ai plătit?")).toHaveDisplayValue("Corectat");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("goes back with a message when the document was deleted in the meantime", async () => {
    await openEditor();
    await screen.findByLabelText("Pentru ce ai plătit?");
    respond(404, { code: "DOCUMENT_NOT_FOUND" });

    await fireEvent.press(saveButton());

    expect(Alert.alert).toHaveBeenCalledWith(DOCUMENT_MESSAGES.notFound);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("Renunță goes back without saving", async () => {
    await openEditor();
    await screen.findByLabelText("Pentru ce ai plătit?");

    await fireEvent.press(screen.getByText(EDIT_MESSAGES.cancel));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  });

  it("shows that the document was not found, with a way back", async () => {
    paramsMock.mockReturnValue({ id: "gone" });
    respond(404, { code: "DOCUMENT_NOT_FOUND" });

    await render(<EditDocumentScreen />);

    expect(await screen.findByText(DOCUMENT_MESSAGES.notFound)).toBeOnTheScreen();
    expect(screen.getByText(EDIT_MESSAGES.cancel)).toBeOnTheScreen();
  });

  it("offers to retry when the document cannot be loaded", async () => {
    paramsMock.mockReturnValue({ id: "doc-1" });
    apiFetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    await render(<EditDocumentScreen />);
    expect(await screen.findByText(HOME_MESSAGES.loadError)).toBeOnTheScreen();
    respond(200, { document: manual });

    await fireEvent.press(screen.getByRole("button", { name: HOME_MESSAGES.retry }));

    expect(await screen.findByLabelText("Pentru ce ai plătit?")).toHaveDisplayValue("Farmacia Tei");
  });
});
