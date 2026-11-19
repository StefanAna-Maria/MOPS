import { Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { ExpenseDocument, OcrReading, Scan } from "@ocrinvoice/shared";
import ScanResultScreen from "@/app/(app)/scan-result/[id]";
import DocumentScreen from "@/app/(app)/document/[id]";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { fetchScan } from "@/lib/scan-upload";

jest.mock("@/lib/scan-upload", () => ({ POLL_INTERVAL_MS: 2000, fetchScan: jest.fn() }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));

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
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ document: scanned }) });

    await render(<DocumentScreen />);

    expect(await screen.findByText("Alimente · Bon scanat")).toBeOnTheScreen();
    expect(screen.getByLabelText("Poza documentului").props.source).toMatchObject({
      uri: `${API_URL}/api/scans/scan-1/image`,
    });
  });
});
