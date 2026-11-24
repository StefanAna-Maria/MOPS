import { useState } from "react";
import { Alert, Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { CategoryOption, ExpenseDocument } from "@ocrinvoice/shared";
import { CategoryField } from "@/components/category-field";
import { createCategory, deleteCategory, saveCategoryOrder } from "@/lib/categories";
import { documentSubtitle } from "@/lib/expense-list";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/categories", () => ({
  ...jest.requireActual("@/lib/categories"),
  createCategory: jest.fn(),
  deleteCategory: jest.fn(),
  saveCategoryOrder: jest.fn(),
}));

const createMock = createCategory as unknown as jest.Mock;
const deleteMock = deleteCategory as unknown as jest.Mock;
const saveOrderMock = saveCategoryOrder as unknown as jest.Mock;

const START: CategoryOption[] = [
  { id: "GROCERIES", name: "Alimente", builtIn: true },
  { id: "cmwcustom00000000000000001", name: "Sală de sport", builtIn: false },
  { id: "OTHER", name: "Altele", builtIn: true },
];

/** The field with real state, showing the chosen category and the list, as the form uses it. */
function Harness() {
  const [value, setValue] = useState("OTHER");
  const [categories, setCategories] = useState(START);
  return (
    <>
      <CategoryField value={value} categories={categories} onChange={setValue} onCategoriesChange={setCategories} />
      <Text testID="chosen">{value}</Text>
      <Text testID="list">{categories.map((category) => category.name).join("|")}</Text>
    </>
  );
}

/** Presses the confirming button of the last Alert (e.g. "Șterge"). */
async function confirmAlert(buttonText: string) {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => unknown }[];
  await act(async () => {
    await buttons.find((button) => button.text === buttonText)?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("US-03: categories in the expense form", () => {
  it("lists the built-in categories and my own", async () => {
    await render(<Harness />);

    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));

    expect(screen.getByRole("button", { name: "Alimente" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Sală de sport" })).toBeOnTheScreen();
  });

  it("adds a category of my own, puts it before Altele and selects it", async () => {
    createMock.mockResolvedValue({ ok: true, value: { id: "cmwcustom00000000000000002", name: "Cadouri", builtIn: false } });
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));

    await fireEvent.changeText(screen.getByLabelText("Categorie nouă"), "  Cadouri ");
    await fireEvent.press(screen.getByRole("button", { name: "Adaugă categoria" }));

    expect(createMock).toHaveBeenCalledWith("Cadouri");
    expect(screen.getByTestId("chosen")).toHaveTextContent("cmwcustom00000000000000002");
    expect(screen.getByTestId("list")).toHaveTextContent("Alimente|Sală de sport|Cadouri|Altele");
  });

  it("says so when a category with that name already exists", async () => {
    createMock.mockResolvedValue({ ok: false, error: "EXISTS" });
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));

    await fireEvent.changeText(screen.getByLabelText("Categorie nouă"), "alimente");
    await fireEvent.press(screen.getByRole("button", { name: "Adaugă categoria" }));

    expect(Alert.alert).toHaveBeenCalledWith("Nu am putut salva categoria", "Există deja o categorie cu acest nume.");
  });

  it("deletes a category I do not use, after asking", async () => {
    deleteMock.mockResolvedValue({ ok: true, value: null });
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));

    await fireEvent.press(screen.getByRole("button", { name: "Șterge categoria Sală de sport" }));
    expect(Alert.alert).toHaveBeenCalledWith("Ștergi categoria?", "„Sală de sport” nu va mai apărea în listă.", expect.any(Array));
    await confirmAlert("Șterge");

    expect(deleteMock).toHaveBeenCalledWith("cmwcustom00000000000000001");
    expect(screen.getByTestId("list")).toHaveTextContent("Alimente|Altele");
  });

  it("does not delete a category an expense uses, and says how many use it", async () => {
    deleteMock.mockResolvedValue({ ok: false, error: "IN_USE", count: 3 });
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));

    await fireEvent.press(screen.getByRole("button", { name: "Șterge categoria Alimente" }));
    await confirmAlert("Șterge");

    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Categoria este folosită",
      "3 cheltuieli au această categorie, așa că nu poate fi ștearsă.",
    );
    expect(screen.getByTestId("list")).toHaveTextContent("Alimente|Sală de sport|Altele");
  });

  it("goes back to Altele when the chosen category is deleted", async () => {
    deleteMock.mockResolvedValue({ ok: true, value: null });
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));
    await fireEvent.press(screen.getByRole("button", { name: "Sală de sport" }));
    expect(screen.getByTestId("chosen")).toHaveTextContent("cmwcustom00000000000000001");

    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Sală de sport" }));
    await fireEvent.press(screen.getByRole("button", { name: "Șterge categoria Sală de sport" }));
    await confirmAlert("Șterge");

    expect(screen.getByTestId("chosen")).toHaveTextContent("OTHER");
  });

  it("offers no way to delete Altele", async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));

    expect(screen.queryByRole("button", { name: "Șterge categoria Altele" })).toBeNull();
  });
});

describe("US-03: names of my own categories on Acasă", () => {
  it("shows the name the server gives for a category of my own", () => {
    const document = {
      id: "d1",
      context: "personal",
      type: "MANUAL",
      merchant: "Abonament",
      date: "2026-11-24",
      time: null,
      total: "150.00",
      category: "cmwcustom00000000000000001",
      categoryName: "Sală de sport",
      paymentMethod: "CARD",
      note: null,
      fileId: null,
      createdAt: "2026-11-24T10:00:00.000Z",
      lines: [],
    } as ExpenseDocument;

    expect(documentSubtitle(document)).toBe("Sală de sport · Cheltuială manuală");
  });
});

describe("US-03: putting categories in my own order", () => {
  it("moves a category with the arrows and saves the order with Gata", async () => {
    saveOrderMock.mockImplementation(async (order: string[]) => ({
      ok: true,
      value: order.map((id) => START.find((category) => category.id === id)),
    }));
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));

    await fireEvent.press(screen.getByRole("button", { name: "Schimbă ordinea" }));
    await fireEvent.press(screen.getByRole("button", { name: "Mută mai sus Sală de sport" }));
    await fireEvent.press(screen.getByRole("button", { name: "Gata" }));

    expect(saveOrderMock).toHaveBeenCalledWith(["cmwcustom00000000000000001", "GROCERIES", "OTHER"]);
    expect(screen.getByTestId("list")).toHaveTextContent("Sală de sport|Alimente|Altele");
  });

  it("cannot move the first category up or the last one down", async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));
    await fireEvent.press(screen.getByRole("button", { name: "Schimbă ordinea" }));

    expect(screen.getByRole("button", { name: "Mută mai sus Alimente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mută mai jos Altele" })).toBeDisabled();
    // While ordering, there is nothing to delete or add.
    expect(screen.queryByRole("button", { name: "Șterge categoria Alimente" })).toBeNull();
    expect(screen.queryByLabelText("Categorie nouă")).toBeNull();
  });

  it("keeps the old order when the sheet is closed without Gata", async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));
    await fireEvent.press(screen.getByRole("button", { name: "Schimbă ordinea" }));
    await fireEvent.press(screen.getByRole("button", { name: "Mută mai jos Alimente" }));

    await fireEvent.press(screen.getByLabelText("Închide"));

    expect(saveOrderMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("list")).toHaveTextContent("Alimente|Sală de sport|Altele");
  });

  it("says so when the order could not be saved, and keeps the old one", async () => {
    saveOrderMock.mockResolvedValue({ ok: false, error: "INVALID" });
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("button", { name: "Categorie: Altele" }));
    await fireEvent.press(screen.getByRole("button", { name: "Schimbă ordinea" }));
    await fireEvent.press(screen.getByRole("button", { name: "Mută mai jos Alimente" }));

    await fireEvent.press(screen.getByRole("button", { name: "Gata" }));

    expect(Alert.alert).toHaveBeenCalledWith("Nu am putut salva ordinea", "Încearcă din nou.");
    expect(screen.getByTestId("list")).toHaveTextContent("Alimente|Sală de sport|Altele");
  });
});
