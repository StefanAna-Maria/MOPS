import { useEffect } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { ExpenseDocument } from "@ocrinvoice/shared";
import DocumentScreen from "@/app/(app)/document/[id]";
import { apiFetch } from "@/lib/api";
import { DOCUMENT_MESSAGES, HOME_MESSAGES } from "@/lib/expense-messages";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/auth-client", () => ({ authClient: { getCookie: jest.fn(async () => "session=abc") } }));

const apiFetchMock = apiFetch as unknown as jest.Mock;
const paramsMock = useLocalSearchParams as unknown as jest.Mock;

const document: ExpenseDocument = {
  id: "doc-1",
  context: "personal",
  type: "MANUAL",
  merchant: "Farmacia Tei",
  date: "2026-11-05",
  time: null,
  total: "1234.50",
  category: "HEALTH",
  paymentMethod: "TRANSFER",
  note: "rețetă compensată",
  fileId: null,
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

  it("CA-06.1: shows a manual expense's merchant, date, total, payment and note, without a PRODUSE list", async () => {
    respond(200, { document });

    await render(<DocumentScreen />);

    expect(await screen.findByRole("header", { name: "Farmacia Tei" })).toBeOnTheScreen();
    expect(screen.getByText("Sănătate · Cheltuială manuală")).toBeOnTheScreen();
    expect(screen.getByText("05.11.2026")).toBeOnTheScreen();
    expect(screen.getByText("1.234,50 lei")).toBeOnTheScreen();
    // Its only line repeats the expense itself, so there is no PRODUSE list (2026-11-24).
    expect(screen.queryByText("PRODUSE")).toBeNull();
    expect(screen.getAllByText("Farmacia Tei")).toHaveLength(1);
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

describe("US-09: a saved invoice", () => {
  it("shows Factură scanată and, under each invoice line, quantity × unit price without VAT + VAT", async () => {
    respond(200, {
      document: {
        ...document,
        type: "SCANNED_INVOICE",
        merchant: "VANESSE SARL",
        total: "184.20",
        category: "SHOPPING",
        lines: [
          { id: "l1", position: 1, name: "Incarcator 100W", amount: "199.20", category: "SHOPPING", quantity: "1", unitPrice: "166.00", vatAmount: "33.20" },
          { id: "l2", position: 2, name: "Reducere voucher", amount: "-15.00", category: "SHOPPING", quantity: "1", unitPrice: null, vatAmount: "0.00" },
        ],
      },
    });

    await render(<DocumentScreen />);

    expect(await screen.findByText("Cumpărături · Factură scanată")).toBeOnTheScreen();
    expect(screen.getByText("1 × 166,00 lei fără TVA + TVA 33,20 lei")).toBeOnTheScreen();
    expect(screen.getByText("199,20 lei")).toBeOnTheScreen();
    // A discount line without a unit price gets no detail line.
    expect(screen.getAllByText(/fără TVA/)).toHaveLength(1);
  });

  it("shows no invoice details for a manual expense", async () => {
    respond(200, { document });

    await render(<DocumentScreen />);

    await screen.findByRole("header", { name: "Farmacia Tei" });
    expect(screen.queryByText(/fără TVA/)).toBeNull();
  });
});

describe("US-06: scanned documents", () => {
  const scannedReceipt = {
    ...document,
    type: "SCANNED",
    merchant: "Mega Image",
    time: "13:31",
    total: "18.28",
    category: "GROCERIES",
    fileId: "file-1",
    lines: [
      { id: "l1", position: 1, name: "LAPTE 1L", amount: "8.29", category: "GROCERIES", quantity: null, unitPrice: null, vatAmount: null },
      { id: "l2", position: 2, name: "BR CHEDDAR 150G", amount: "9.99", category: "GROCERIES", quantity: null, unitPrice: null, vatAmount: null },
    ],
  };

  function respondWithPhoto(doc: unknown) {
    apiFetchMock.mockImplementation(async (path: string) =>
      path.endsWith("/image")
        ? { ok: true, status: 200, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer }
        : { ok: true, status: 200, json: async () => ({ document: doc }) },
    );
  }

  it("shows a scanned receipt's products, with its time, and its photo at the end", async () => {
    respondWithPhoto(scannedReceipt);

    await render(<DocumentScreen />);

    expect(await screen.findByText("PRODUSE")).toBeOnTheScreen();
    expect(screen.getByText("LAPTE 1L")).toBeOnTheScreen();
    expect(screen.getByText("05.11.2026, 13:31")).toBeOnTheScreen();
    expect(screen.getByText("POZA")).toBeOnTheScreen();
    const photo = await screen.findByTestId("document-photo");
    expect(photo.props.source.uri).toMatch(/^data:image\/jpeg;base64,/);
    // The photo comes after the products.
    const texts = screen.getAllByText(/^(PRODUSE|POZA)$/).map((node) => node.props.children);
    expect(texts).toEqual(["PRODUSE", "POZA"]);
  });

  it("opens the photo full screen when tapped", async () => {
    respondWithPhoto(scannedReceipt);
    await render(<DocumentScreen />);

    await fireEvent.press(await screen.findByLabelText("Poza documentului"));

    expect(screen.getByRole("button", { name: "Închide" })).toBeOnTheScreen();
  });

  it("shows a scanned invoice as Factură scanată, with its date only (an invoice has no time)", async () => {
    respondWithPhoto({ ...scannedReceipt, type: "SCANNED_INVOICE", merchant: "VANESSE SARL", time: "13:43" });

    await render(<DocumentScreen />);

    expect(await screen.findByText("Alimente · Factură scanată")).toBeOnTheScreen();
    expect(screen.getByText("05.11.2026")).toBeOnTheScreen();
    expect(screen.queryByText(/13:43/)).toBeNull();
  });

  it("says so when the photo cannot be loaded, instead of showing a white box", async () => {
    apiFetchMock.mockImplementation(async (path: string) =>
      path.endsWith("/image")
        ? { ok: false, status: 401, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }
        : { ok: true, status: 200, json: async () => ({ document: scannedReceipt }) },
    );

    await render(<DocumentScreen />);

    expect(await screen.findByText("Poza nu a putut fi încărcată.")).toBeOnTheScreen();
  });
});

describe("US-06: Notă", () => {
  it("shows Notă for a manual expense", async () => {
    respond(200, { document });

    await render(<DocumentScreen />);

    expect(await screen.findByText("Notă")).toBeOnTheScreen();
    expect(screen.getByText("rețetă compensată")).toBeOnTheScreen();
  });

  it.each(["SCANNED", "SCANNED_INVOICE"])("does not show Notă for a %s document", async (type) => {
    respond(200, { document: { ...document, type, note: null, lines: [] } });

    await render(<DocumentScreen />);

    await screen.findByRole("header", { name: "Farmacia Tei" });
    expect(screen.queryByText("Notă")).toBeNull();
  });
});

describe("US-13: Editează documentul", () => {
  it("CA-13.1: opens the editing of the document", async () => {
    respond(200, { document });
    await render(<DocumentScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: "Editează documentul" }));

    expect(router.push).toHaveBeenCalledWith({ pathname: "/edit-document/[id]", params: { id: "doc-1" } });
  });

  it("CA-13.1: a scanned document can be edited too", async () => {
    respond(200, { document: { ...document, type: "SCANNED", lines: [] } });
    await render(<DocumentScreen />);

    expect(await screen.findByRole("button", { name: "Editează documentul" })).toBeOnTheScreen();
  });

  it("CA-13.1: Editează documentul is above Șterge documentul", async () => {
    respond(200, { document });
    await render(<DocumentScreen />);

    await screen.findByRole("button", { name: "Editează documentul" });

    const titles = screen.getAllByText(/Editează documentul|Șterge documentul/).map((node) => node.props.children);
    expect(titles).toEqual(["Editează documentul", "Șterge documentul"]);
  });

  it("CA-13.1: shows the note a user added to a scanned document", async () => {
    respond(200, { document: { ...document, type: "SCANNED", note: "fără pungă", lines: [] } });

    await render(<DocumentScreen />);

    expect(await screen.findByText("Notă")).toBeOnTheScreen();
    expect(screen.getByText("fără pungă")).toBeOnTheScreen();
  });

  describe("coming back to the screen after a correction (CA-13.2)", () => {
    // The screen reloads the document each time it comes back into focus; the test triggers that by hand.
    let refocus: () => void = () => {};

    beforeEach(() => {
      const expoRouter = jest.requireMock("expo-router");
      jest.spyOn(expoRouter, "useFocusEffect").mockImplementation((effect: unknown) => {
        const run = effect as () => void | (() => void);
        useEffect(() => run(), [run]);
        refocus = run as () => void;
      });
    });

    it("shows the corrected document after coming back", async () => {
      respond(200, { document });
      await render(<DocumentScreen />);
      expect(await screen.findByText("1.234,50 lei")).toBeOnTheScreen();

      respond(200, { document: { ...document, merchant: "Farmacia Catena", total: "99.90" } });
      await act(async () => {
        refocus();
      });

      expect(await screen.findByRole("header", { name: "Farmacia Catena" })).toBeOnTheScreen();
      expect(screen.getByText("99,90 lei")).toBeOnTheScreen();
      expect(screen.queryByText("1.234,50 lei")).toBeNull();
    });

    it("keeps the document shown when the reload fails", async () => {
      respond(200, { document });
      await render(<DocumentScreen />);
      expect(await screen.findByText("1.234,50 lei")).toBeOnTheScreen();

      apiFetchMock.mockRejectedValueOnce(new Error("timeout"));
      await act(async () => {
        refocus();
      });

      expect(screen.getByRole("header", { name: "Farmacia Tei" })).toBeOnTheScreen();
      expect(screen.queryByText(HOME_MESSAGES.loadError)).toBeNull();
    });

    it("shows Documentul nu a fost găsit. when the document was deleted meanwhile", async () => {
      respond(200, { document });
      await render(<DocumentScreen />);
      await screen.findByText("1.234,50 lei");

      respond(404, { code: "DOCUMENT_NOT_FOUND" });
      await act(async () => {
        refocus();
      });

      expect(await screen.findByText(DOCUMENT_MESSAGES.notFound)).toBeOnTheScreen();
    });
  });
});
