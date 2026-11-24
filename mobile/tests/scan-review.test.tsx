import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { ExpenseDocument, OcrReading, Scan } from "@ocrinvoice/shared";
import ScanResultScreen from "@/app/(app)/scan-result/[id]";
import DocumentScreen from "@/app/(app)/document/[id]";
import { apiFetch } from "@/lib/api";
import { fetchScan } from "@/lib/scan-upload";

jest.mock("@/lib/scan-upload", () => ({ POLL_INTERVAL_MS: 2000, fetchScan: jest.fn() }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
// US-03: the user's categories (built-in ones, plus "Sală de sport" of their own).
const GYM = "cmgym0000000000000000000a";
const mockFetchCategories = jest.fn();
jest.mock("@/lib/categories", () => ({
  ...jest.requireActual("@/lib/categories"),
  fetchCategories: () => mockFetchCategories(),
}));
jest.mock("@/lib/auth-client", () => ({ authClient: { getCookie: jest.fn(async () => "session=abc") } }));

jest.setTimeout(15_000);

const fetchScanMock = fetchScan as unknown as jest.Mock;
const apiFetchMock = apiFetch as unknown as jest.Mock;
const paramsMock = useLocalSearchParams as unknown as jest.Mock;

const reading: OcrReading = {
  merchant: { value: "Carrefour express", confidence: 0.98 },
  date: { value: "2026-11-12", confidence: 0.98 },
  time: { value: "17:58", confidence: 0.98 },
  total: { value: "26.17", confidence: 0.5 },
  paymentMethod: { value: "CARD", confidence: 0.98 },
  items: [
    {
      name: { value: "PARTY MIX 60G", confidence: 0.95 },
      quantity: { value: 2, confidence: 0.95 },
      amount: { value: "29.37", confidence: 0.95 },
      category: { value: "GROCERIES", confidence: 0.95 },
    },
    {
      name: { value: "DISCOUNT", confidence: 0.95 },
      quantity: { value: 1, confidence: 0.95 },
      amount: { value: "-3.20", confidence: 0.95 },
      category: { value: "GROCERIES", confidence: 0.95 },
    },
  ],
  itemsTotal: "26.17",
  totalMatches: true,
};

const withoutDiscount: OcrReading = {
  ...reading,
  total: { value: "26.17", confidence: 0.4 },
  items: reading.items.slice(0, 1),
  itemsTotal: "29.37",
  totalMatches: false,
};

function doneScan(value: OcrReading): Scan {
  return {
    id: "scan-1",
    context: "personal",
    status: "DONE",
    uploadedAt: "2026-11-19T10:00:00.000Z",
    reading: value,
    errorCode: null,
  };
}

async function showReview(value: OcrReading = reading) {
  fetchScanMock.mockResolvedValue(doneScan(value));
  await render(<ScanResultScreen />);
  await screen.findByLabelText("Magazin");
}

const saveButton = () => screen.getByRole("button", { name: "Salvează documentul" });

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchCategories.mockImplementation(async () => {
    const builtIn = jest.requireActual("@/lib/categories").BUILT_IN_CATEGORIES;
    return [...builtIn.slice(0, -1), { id: GYM, name: "Sală de sport", builtIn: false }, builtIn[builtIn.length - 1]];
  });
  paramsMock.mockReturnValue({ id: "scan-1" });
});

describe("Verificarea datelor citite", () => {
  it("CA-11.1: marks Verifică only the values read with a confidence under 0.8", async () => {
    await showReview();

    expect(screen.getByLabelText("Total: Verifică")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Magazin: Verifică")).toBeNull();
    expect(screen.getByDisplayValue("Carrefour express")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("26,17")).toBeOnTheScreen();
  });

  it("CA-11.1: a corrected value is marked Corectat", async () => {
    await showReview();

    await fireEvent.changeText(screen.getByLabelText("Total"), "26,18");

    expect(screen.getByLabelText("Total: Corectat")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Total: Verifică")).toBeNull();
  });

  it("CA-11.1: a value that was read right can be confirmed without retyping it", async () => {
    await showReview();

    await fireEvent.press(screen.getByRole("button", { name: "E corect: Total" }));

    expect(screen.queryByLabelText("Total: Verifică")).toBeNull();
    expect(saveButton()).toBeEnabled();
  });

  it("CA-11.2: shows the sum of the products and that it matches the total", async () => {
    await showReview();

    expect(screen.getByText("Suma produselor: 26,17 lei")).toBeOnTheScreen();
    expect(screen.getByText("Se potrivește cu totalul de pe bon")).toBeOnTheScreen();
  });

  it("CA-11.2: shows the difference from the total, recalculated while the user types", async () => {
    await showReview(withoutDiscount);

    expect(screen.getByText("Diferență de 3,20 lei față de total")).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText("Suma produsului 1"), "27,17");

    expect(screen.getByText("Diferență de 1,00 lei față de total")).toBeOnTheScreen();
  });

  it("CA-11.3: saving is blocked while a value has to be checked", async () => {
    await showReview();

    expect(saveButton()).toBeDisabled();
  });

  it("CA-11.3: saving is blocked while the products do not add up to the total", async () => {
    await showReview(withoutDiscount);

    await fireEvent.press(screen.getByRole("button", { name: "E corect: Total" }));

    expect(saveButton()).toBeDisabled();
  });

  it("CA-11.3: a product missed by the reading can be added, so the total matches", async () => {
    await showReview(withoutDiscount);
    await fireEvent.press(screen.getByRole("button", { name: "E corect: Total" }));

    await fireEvent.press(screen.getByRole("button", { name: "Adaugă un produs" }));
    await fireEvent.changeText(screen.getByLabelText("Produsul 2"), "DISCOUNT");
    await fireEvent.changeText(screen.getByLabelText("Suma produsului 2"), "-3,20");

    expect(screen.getByText("Se potrivește cu totalul de pe bon")).toBeOnTheScreen();
    expect(saveButton()).toBeEnabled();
  });

  it("CA-11.2: a product can be deleted, and the sum follows", async () => {
    await showReview();

    await fireEvent.press(screen.getByRole("button", { name: "Șterge produsul 2" }));

    expect(screen.queryByLabelText("Produsul 2")).toBeNull();
    expect(screen.getByText("Suma produselor: 29,37 lei")).toBeOnTheScreen();
  });

  it("CA-11.4: saves the checked document and goes back to Acasă", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ document: { id: "doc-1" } }) });
    await showReview();
    await fireEvent.press(screen.getByRole("button", { name: "E corect: Total" }));

    await fireEvent.press(saveButton());

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetchMock.mock.calls[0];
    expect(path).toBe("/api/scans/scan-1/document");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      documentKind: "RECEIPT",
      merchant: "Carrefour express",
      date: "2026-11-12",
      time: "17:58",
      total: "26.17",
      paymentMethod: "CARD",
      category: "GROCERIES",
      items: [
        { name: "PARTY MIX 60G", amount: "29.37", category: "GROCERIES" },
        { name: "DISCOUNT", amount: "-3.20", category: "GROCERIES" },
      ],
    });
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("shows Serverul nu răspunde when the document cannot be saved, and keeps the values", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    apiFetchMock.mockRejectedValue(new Error("Network request failed"));
    await showReview();
    await fireEvent.press(screen.getByRole("button", { name: "E corect: Total" }));

    await fireEvent.press(saveButton());

    expect(alertSpy).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Carrefour express")).toBeOnTheScreen();
  });
});

describe("De ce nu se poate salva", () => {
  const withFreeSauce: OcrReading = {
    ...reading,
    total: { value: "20.00", confidence: 0.95 },
    items: [
      {
        ...reading.items[0],
        name: { value: "SPRING ROLLS", confidence: 0.95 },
        amount: { value: "5.00", confidence: 0.95 },
      },
      {
        ...reading.items[0],
        name: { value: "SOS SWEET CHILLI - INCLUS", confidence: 0.95 },
        amount: { value: "0.00", confidence: 0.95 },
      },
      {
        ...reading.items[0],
        name: { value: "OREZ CHICKEN FINGERS", confidence: 0.95 },
        amount: { value: "15.00", confidence: 0.95 },
      },
    ],
    itemsTotal: "20.00",
    totalMatches: true,
  };

  it("a free product (0,00 lei) does not block saving", async () => {
    await showReview(withFreeSauce);

    expect(screen.getByText("Se potrivește cu totalul de pe bon")).toBeOnTheScreen();
    expect(saveButton()).toBeEnabled();
  });

  it("says why saving is blocked", async () => {
    await showReview(withoutDiscount);

    expect(screen.getByText("Mai ai o valoare de verificat.")).toBeOnTheScreen();
    expect(screen.getByText("Produsele nu se potrivesc cu totalul de pe bon.")).toBeOnTheScreen();
  });

  it("points to a product amount that is not valid", async () => {
    await showReview();
    await fireEvent.press(screen.getByRole("button", { name: "E corect: Total" }));

    await fireEvent.changeText(screen.getByLabelText("Suma produsului 1"), "29,375");

    expect(screen.getByText("Introdu o sumă cu cel mult două zecimale.")).toBeOnTheScreen();
    expect(screen.getByText("Suma unui produs nu este validă.")).toBeOnTheScreen();
    expect(saveButton()).toBeDisabled();
  });

  it("a value that was not read at all cannot be confirmed with E corect, it has to be filled in", async () => {
    await showReview({ ...reading, merchant: { value: null, confidence: 0 } });

    expect(screen.getByLabelText("Magazin: Verifică")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "E corect: Magazin" })).toBeNull();
  });
});

describe("Data și ora, alese din calendar și din rotițe", () => {
  async function pick(fieldName: string, date: Date) {
    await fireEvent.press(screen.getByRole("button", { name: fieldName }));
    const picker = screen.getByTestId("date-time-picker");
    await act(async () => {
      picker.props.onChange({ type: "set" }, date);
    });
    await fireEvent.press(screen.getByRole("button", { name: "Gata" }));
  }

  it("the date is picked from a calendar that does not offer future days", async () => {
    await showReview();

    await fireEvent.press(screen.getByRole("button", { name: "Data: 12.11.2026" }));
    const picker = screen.getByTestId("date-time-picker");

    expect(picker.props.mode).toBe("date");
    expect(picker.props.display).toBe("inline");
    expect(picker.props.maximumDate.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("a date picked from the calendar is marked Corectat", async () => {
    await showReview();

    await pick("Data: 12.11.2026", new Date(2026, 10, 10));

    expect(screen.getByRole("button", { name: "Data: 10.11.2026" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Data: Corectat")).toBeOnTheScreen();
  });

  it("the time is picked from a wheel, like an alarm", async () => {
    await showReview();

    await fireEvent.press(screen.getByRole("button", { name: "Ora: 17:58" }));
    const picker = screen.getByTestId("date-time-picker");

    expect(picker.props.mode).toBe("time");
    expect(picker.props.display).toBe("spinner");
  });

  it("a time later than now is refused for today's date, and saving stays blocked", async () => {
    await showReview();
    await fireEvent.press(screen.getByRole("button", { name: "E corect: Total" }));
    const today = new Date();
    const lateToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59);

    await pick("Data: 12.11.2026", today);
    await pick("Ora: 17:58", lateToday);

    expect(screen.getAllByText("Ora nu poate fi în viitor.")).toHaveLength(2);
    expect(saveButton()).toBeDisabled();
  });

  it("a late time is fine on a past day", async () => {
    await showReview();
    await fireEvent.press(screen.getByRole("button", { name: "E corect: Total" }));

    await pick("Ora: 17:58", new Date(2026, 10, 12, 23, 59));

    expect(screen.queryByText("Ora nu poate fi în viitor.")).toBeNull();
    expect(saveButton()).toBeEnabled();
  });
});

describe("Documentul salvat, cu poza atașată", () => {
  const scanned: ExpenseDocument = {
    id: "doc-1",
    context: "personal",
    type: "SCANNED",
    merchant: "Carrefour express",
    date: "2026-11-12",
    time: "17:58",
    total: "26.17",
    category: "GROCERIES",
    paymentMethod: "CARD",
    note: null,
    fileId: "scan-1",
    createdAt: "2026-11-19T10:00:00.000Z",
    lines: [{ id: "l1", position: 1, name: "PARTY MIX 60G", amount: "26.17", category: "GROCERIES" }],
  };

  it("CA-11.4: the detail of a scanned document shows it as Bon scanat, with its photo", async () => {
    paramsMock.mockReturnValue({ id: "doc-1" });
    apiFetchMock.mockImplementation(async (path: string) =>
      path.endsWith("/image")
        ? { ok: true, status: 200, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer }
        : { ok: true, status: 200, json: async () => ({ document: scanned }) },
    );

    await render(<DocumentScreen />);

    expect(await screen.findByText("Alimente · Bon scanat")).toBeOnTheScreen();
    // The photo is downloaded with the session (apiFetch), not by the image loader, which got 401 on Android.
    expect(apiFetchMock).toHaveBeenCalledWith("/api/scans/scan-1/image");
    const photo = await screen.findByTestId("document-photo");
    expect(photo.props.source).toEqual({ uri: "data:image/jpeg;base64,/9j/" });
  });
});

describe("US-09: invoices on the review screen", () => {
  const field = <T,>(value: T, confidence = 0.95) => ({ value, confidence });
  const invoiceReading: OcrReading = {
    documentKind: "INVOICE",
    merchant: field("Birotica Expert SRL"),
    date: field("2026-11-10"),
    time: { value: null, confidence: 0 },
    total: field("424.18"),
    paymentMethod: field("TRANSFER" as const),
    items: [
      {
        name: field("Hârtie copiator A4"),
        quantity: field(3),
        unitPrice: field("50.00"),
        vatAmount: field("31.50"),
        amount: field("181.50"),
        category: field("SHOPPING" as const),
      },
      {
        name: field("Toner imprimantă"),
        quantity: field(2),
        unitPrice: field("89.90"),
        vatAmount: field("37.76"),
        amount: field("217.56"),
        category: field("SHOPPING" as const),
      },
      {
        name: field("Carte contabilitate"),
        quantity: field(1),
        unitPrice: field("22.63"),
        vatAmount: field("2.49"),
        amount: field("25.12"),
        category: field("EDUCATION" as const),
      },
    ],
    itemsTotal: "424.18",
    totalMatches: true,
  };

  it("says it read an invoice, names the supplier, and shows unit price without VAT + VAT under each line total", async () => {
    fetchScanMock.mockResolvedValue(doneScan(invoiceReading));
    await render(<ScanResultScreen />);

    expect(await screen.findByText("Document citit: Factură")).toBeOnTheScreen();
    expect(screen.getByLabelText("Furnizor")).toHaveDisplayValue("Birotica Expert SRL");
    expect(screen.getByDisplayValue("181,50")).toBeOnTheScreen();
    expect(screen.getByText("3 × 50,00 lei fără TVA + TVA 31,50 lei")).toBeOnTheScreen();
    expect(screen.getByText("2 × 89,90 lei fără TVA + TVA 37,76 lei")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("424,18")).toBeOnTheScreen();
  });

  it("shows a receipt as Bon fiscal, with Magazin and no invoice details", async () => {
    await showReview();

    expect(screen.getByText("Document citit: Bon fiscal")).toBeOnTheScreen();
    expect(screen.queryByText(/fără TVA/)).toBeNull();
  });
});

describe("US-06 / US-09: review screen changes (2026-11-24)", () => {
  const field = <T,>(value: T, confidence = 0.95) => ({ value, confidence });
  const invoice = (unitConfidence = 0.9): OcrReading => ({
    documentKind: "INVOICE",
    merchant: field("VANESSE SARL"),
    date: field("2026-11-17"),
    time: { value: null, confidence: 0 },
    total: field("184.20"),
    paymentMethod: field("CARD" as const),
    items: [
      {
        name: field("Incarcator 100W"),
        quantity: field(1),
        unitPrice: field("166.00", unitConfidence),
        vatAmount: field("33.20", unitConfidence),
        amount: field("199.20"),
        category: field("SHOPPING" as const),
      },
      {
        name: field("Reducere voucher"),
        quantity: field(1),
        amount: field("-15.00"),
        category: field("SHOPPING" as const),
      },
    ],
    itemsTotal: "184.20",
    totalMatches: true,
  });

  it("has no document-level Categorie in the first card (each product keeps its own category)", async () => {
    await showReview();

    expect(screen.queryByText("Categorie")).toBeNull();
    expect(screen.getByLabelText(/^Categoria produsului 1/)).toBeOnTheScreen();
  });

  it("shows no Ora for an invoice, flags nothing about it, and saves the invoice without a time", async () => {
    fetchScanMock.mockResolvedValue(doneScan(invoice()));
    apiFetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ document: {} }) });
    await render(<ScanResultScreen />);
    await screen.findByText("Document citit: Factură");

    expect(screen.queryByText("Ora")).toBeNull();
    expect(screen.queryByLabelText("Ora: Verifică")).toBeNull();

    await fireEvent.press(saveButton());

    const body = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(body.time).toBeNull();
    expect(body.documentKind).toBe("INVOICE");
  });

  it("flags an invoice line's unit price and VAT read under 0.8 with Verifică", async () => {
    fetchScanMock.mockResolvedValue(doneScan(invoice(0.4)));
    await render(<ScanResultScreen />);

    expect(await screen.findByText("1 × 166,00 lei fără TVA + TVA 33,20 lei · Verifică")).toBeOnTheScreen();
  });

  it("does not flag them when they were read with enough confidence", async () => {
    fetchScanMock.mockResolvedValue(doneScan(invoice(0.9)));
    await render(<ScanResultScreen />);

    expect(await screen.findByText("1 × 166,00 lei fără TVA + TVA 33,20 lei")).toBeOnTheScreen();
  });
});

describe("US-03: the user's categories on a scanned document (2026-11-24)", () => {
  const withGym = (category: string): OcrReading => ({
    ...withoutDiscount,
    total: { value: "29.37", confidence: 0.95 },
    itemsTotal: "29.37",
    totalMatches: true,
    items: [{ ...reading.items[0], category: { value: category, confidence: 0.9 } }],
  });

  it("shows a product read in one of the user's own categories by its name, and saves its id", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ document: { id: "doc-1" } }) });
    await showReview(withGym(GYM));

    expect(await screen.findByLabelText("Categoria produsului 1: Sală de sport")).toBeOnTheScreen();
    await fireEvent.press(saveButton());

    const body = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(body.category).toBe(GYM);
    expect(body.items[0].category).toBe(GYM);
  });

  it("lets the user pick one of their own categories for a product", async () => {
    await showReview(withGym("GROCERIES"));
    await screen.findByLabelText("Categoria produsului 1: Alimente");

    await fireEvent.press(screen.getByLabelText("Categoria produsului 1: Alimente"));
    await fireEvent.press(screen.getByRole("button", { name: "Sală de sport" }));

    expect(screen.getByLabelText("Categoria produsului 1: Sală de sport")).toBeOnTheScreen();
    expect(screen.getByLabelText("Categoria produsului 1: Corectat")).toBeOnTheScreen();
  });

  it("turns a category removed since the reading into Altele, to be checked", async () => {
    await showReview(withGym("cmgone0000000000000000000a"));

    expect(await screen.findByLabelText("Categoria produsului 1: Altele")).toBeOnTheScreen();
    expect(screen.getByLabelText("Categoria produsului 1: Verifică")).toBeOnTheScreen();
  });
});
