import { fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { ExpenseDocument } from "@ocrinvoice/shared";
import DocumentScreen from "@/app/(app)/document/[id]";
import { apiFetch } from "@/lib/api";
import { DOCUMENT_MESSAGES, HOME_MESSAGES } from "@/lib/expense-messages";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));

const apiFetchMock = apiFetch as unknown as jest.Mock;
const paramsMock = useLocalSearchParams as unknown as jest.Mock;

const document: ExpenseDocument = {
  id: "doc-1",
  type: "MANUAL",
  merchant: "Farmacia Tei",
  date: "2026-11-05",
  time: null,
  total: "1234.50",
  category: "HEALTH",
  paymentMethod: "TRANSFER",
  note: "rețetă compensată",
  createdAt: "2026-11-05T10:00:00.000Z",
  lines: [{ id: "l1", position: 1, name: "Farmacia Tei", amount: "1234.50", category: "HEALTH" }],
};

function respond(status: number, body: unknown) {
  apiFetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
}

beforeEach(() => {
  jest.clearAllMocks();
  paramsMock.mockReturnValue({ id: "doc-1" });
});

describe("Detaliul unui document", () => {
  it("CA-06.1: loads the document by its id", async () => {
    respond(200, { document });

    await render(<DocumentScreen />);

    expect(apiFetchMock).toHaveBeenCalledWith("/api/documents/doc-1");
  });

  it("CA-06.1: shows the merchant, date, total, products, payment and note", async () => {
    respond(200, { document });

    await render(<DocumentScreen />);

    expect(await screen.findByRole("header", { name: "Farmacia Tei" })).toBeOnTheScreen();
    expect(screen.getByText("Sănătate · Cheltuială manuală")).toBeOnTheScreen();
    expect(screen.getByText("05.11.2026")).toBeOnTheScreen();
    expect(screen.getAllByText("1.234,50 lei")).toHaveLength(2);
    expect(screen.getByText("PRODUSE")).toBeOnTheScreen();
    expect(screen.getAllByText("Farmacia Tei")).toHaveLength(2);
    expect(screen.getByText("Transfer")).toBeOnTheScreen();
    expect(screen.getByText("rețetă compensată")).toBeOnTheScreen();
  });

  it("CA-06.1: shows the time when the document has one, and a dash when there is no note", async () => {
    respond(200, { document: { ...document, time: "18:40", note: null } });

    await render(<DocumentScreen />);

    expect(await screen.findByText("05.11.2026, 18:40")).toBeOnTheScreen();
    expect(screen.getByText("—")).toBeOnTheScreen();
  });

  it("CA-06.2: shows Documentul nu a fost găsit. for a missing or someone else's document", async () => {
    respond(404, { code: "DOCUMENT_NOT_FOUND" });

    await render(<DocumentScreen />);

    expect(await screen.findByText(DOCUMENT_MESSAGES.notFound)).toBeOnTheScreen();
  });

  it("shows an error with Încearcă din nou when the server does not answer", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("timeout"));
    await render(<DocumentScreen />);

    expect(await screen.findByText(HOME_MESSAGES.loadError)).toBeOnTheScreen();

    respond(200, { document });
    await fireEvent.press(screen.getByRole("button", { name: HOME_MESSAGES.retry }));

    expect(await screen.findByRole("header", { name: "Farmacia Tei" })).toBeOnTheScreen();
  });

  it("goes back with Înapoi", async () => {
    respond(200, { document });
    await render(<DocumentScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Înapoi" }));

    expect(router.back).toHaveBeenCalled();
  });
});
