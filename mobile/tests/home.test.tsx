import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ExpenseDocument, MonthSummary } from "@ocrinvoice/shared";
import HomeScreen from "@/app/(app)/index";
import { apiFetch } from "@/lib/api";
import { HOME_MESSAGES } from "@/lib/expense-messages";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/components/context-switcher", () => ({ ContextSwitcher: () => null }));
jest.mock("@/components/account-menu", () => ({ AccountMenu: () => null }));
const mockProfile = { activeContext: "personal" as "personal" | "company" };
jest.mock("@/lib/profile-context", () => ({
  useProfile: () => ({ profile: { firstName: "Ana", lastName: "Popescu" }, activeContext: mockProfile.activeContext }),
}));

const apiFetchMock = apiFetch as unknown as jest.Mock;

function doc(id: string, merchant: string, date: string, total: string, category = "GROCERIES"): ExpenseDocument {
  return {
    id,
    context: "personal",
    type: "MANUAL",
    merchant,
    date,
    time: null,
    total,
    category,
    paymentMethod: "CASH",
    note: null,
    fileId: null,
    createdAt: `${date}T10:00:00.000Z`,
    lines: [],
  };
}

function respondWith(documents: ExpenseDocument[], summary?: MonthSummary) {
  apiFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ month: "2026-11", documents, ...(summary ? { summary } : {}) }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile.activeContext = "personal";
  respondWith([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Acasă", () => {
  it.each([
    [9, "Bună dimineața, Ana"],
    [14, "Bună ziua, Ana"],
    [21, "Bună seara, Ana"],
  ])("CA-01.18: at %i:00 shows %s", async (hour, greeting) => {
    jest.useFakeTimers({ now: new Date(2026, 10, 7, hour, 0) });

    await render(<HomeScreen />);

    expect(screen.getByText(greeting)).toBeOnTheScreen();
  });

  it("shows the app name in the header", async () => {
    await render(<HomeScreen />);

    expect(screen.getByText("OCRInvoice")).toBeOnTheScreen();
  });

  it("opens the camera scan screen when pressing Fotografiază un bon", async () => {
    await render(<HomeScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Fotografiază un bon" }));

    expect(router.push).toHaveBeenCalledWith("/scan");
  });
});

describe("Acasă - cheltuielile lunii", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date(2026, 10, 14, 12, 0),
      doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
    });
  });

  it("CA-04.1: loads this month's documents from the server", async () => {
    await render(<HomeScreen />);

    expect(apiFetchMock).toHaveBeenCalledWith("/api/documents?context=personal&type=ALL");
  });

  it("CA-04.1 / CA-04.2: groups the documents by day with each day's total", async () => {
    respondWith([
      doc("a", "Piața Obor", "2026-11-14", "50.00"),
      doc("b", "Mega Image", "2026-11-14", "34.20"),
      doc("c", "Benzinărie", "2026-11-13", "200.00", "TRANSPORT"),
      doc("d", "Farmacie", "2026-11-05", "1234.50", "HEALTH"),
    ]);

    await render(<HomeScreen />);

    expect(await screen.findByText("ASTĂZI")).toBeOnTheScreen();
    expect(screen.getByText("84,20 lei")).toBeOnTheScreen();
    expect(screen.getByText("IERI")).toBeOnTheScreen();
    expect(screen.getByText("JOI, 5 NOIEMBRIE")).toBeOnTheScreen();
    // IERI has a single expense, so the day total and the row show the same amount.
    expect(screen.getAllByText("200,00 lei")).toHaveLength(2);
    expect(screen.getAllByText("1.234,50 lei")).toHaveLength(2);
    const dayTitles = screen.getAllByText(/^(ASTĂZI|IERI|JOI, 5 NOIEMBRIE)$/).map((node) => node.props.children);
    expect(dayTitles).toEqual(["ASTĂZI", "IERI", "JOI, 5 NOIEMBRIE"]);
  });

  it("CA-04.3: each row shows the merchant, the category and type, and the amount", async () => {
    respondWith([doc("a", "Piața Obor", "2026-11-14", "12.50")]);

    await render(<HomeScreen />);

    expect(await screen.findByText("Piața Obor")).toBeOnTheScreen();
    expect(screen.getByText("Alimente · Cheltuială manuală")).toBeOnTheScreen();
    // Single expense of the month: appears in the monthly summary card, the day header and the row.
    expect(screen.getAllByText("12,50 lei")).toHaveLength(3);
  });

  it("CA-04.4: shows a message when there are no documents", async () => {
    await render(<HomeScreen />);

    expect(await screen.findByText(HOME_MESSAGES.empty)).toBeOnTheScreen();
  });

  it("CA-04.7: shows an error with Încearcă din nou, which loads the data again", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("timeout"));
    await render(<HomeScreen />);

    expect(await screen.findByText(HOME_MESSAGES.loadError)).toBeOnTheScreen();

    respondWith([doc("a", "Piața Obor", "2026-11-14", "12.50")]);
    await fireEvent.press(screen.getByRole("button", { name: HOME_MESSAGES.retry }));

    expect(await screen.findByText("Piața Obor")).toBeOnTheScreen();
    expect(screen.queryByText(HOME_MESSAGES.loadError)).toBeNull();
  });

  it("CA-04.7: treats a server error response as a failed load", async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    await render(<HomeScreen />);

    expect(await screen.findByText(HOME_MESSAGES.loadError)).toBeOnTheScreen();
  });
});

describe("Acasă - deschiderea unui document", () => {
  it("CA-06.1: tapping a row opens the document's detail", async () => {
    respondWith([doc("abc", "Piața Obor", "2026-11-14", "12.50")]);
    await render(<HomeScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: /^Piața Obor,/ }));

    expect(router.push).toHaveBeenCalledWith({ pathname: "/document/[id]", params: { id: "abc" } });
  });
});

describe("Acasă - profilul personal și firma", () => {
  it("loads only the company's documents when the company profile is selected", async () => {
    mockProfile.activeContext = "company";

    await render(<HomeScreen />);

    expect(apiFetchMock).toHaveBeenCalledWith("/api/documents?context=company&type=ALL");
    expect(apiFetchMock).not.toHaveBeenCalledWith("/api/documents?context=personal&type=ALL");
  });

  it("reloads the list for the other profile after switching, without showing the old one", async () => {
    respondWith([doc("p", "Cumpărături personale", "2026-11-14", "10.00")]);
    const view = await render(<HomeScreen />);
    expect(await screen.findByText("Cumpărături personale")).toBeOnTheScreen();

    let resolveCompany: (value: unknown) => void = () => {};
    apiFetchMock.mockReturnValueOnce(new Promise((resolve) => (resolveCompany = resolve)));
    mockProfile.activeContext = "company";
    await view.rerender(<HomeScreen />);

    expect(apiFetchMock).toHaveBeenLastCalledWith("/api/documents?context=company&type=ALL");
    expect(screen.queryByText("Cumpărături personale")).toBeNull();

    resolveCompany({
      ok: true,
      status: 200,
      json: async () => ({
        documents: [{ ...doc("c", "Consumabile birou", "2026-11-14", "20.00"), context: "company" }],
      }),
    });
    expect(await screen.findByText("Consumabile birou")).toBeOnTheScreen();
  });
});

describe("Acasă - filtrele după tipul documentului (US-15)", () => {
  const receipt = { ...doc("1", "Mega Image", "2026-11-14", "18.28"), type: "SCANNED" };
  const invoice = { ...doc("2", "eMAG", "2026-11-14", "321.98", "SHOPPING"), type: "SCANNED_INVOICE" };
  const manual = doc("3", "Piața Obor", "2026-11-13", "12.50");

  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date(2026, 10, 14, 12, 0),
      doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
    });
    apiFetchMock.mockImplementation(async (path: string) => {
      const type = new URLSearchParams(path.split("?")[1]).get("type");
      const documents =
        type === "RECEIPTS"
          ? [receipt]
          : type === "INVOICES"
            ? [invoice]
            : type === "MANUAL"
              ? [manual]
              : [receipt, invoice, manual];
      return { ok: true, status: 200, json: async () => ({ month: "2026-11", documents }) };
    });
  });

  it("CA-15.1: shows Toate, Bonuri, Facturi and Manuale, with Toate selected", async () => {
    await render(<HomeScreen />);

    for (const name of ["Toate", "Bonuri", "Facturi", "Manuale"]) {
      expect(screen.getByRole("tab", { name })).toBeOnTheScreen();
    }
    expect(screen.queryByRole("tab", { name: "Chitanțe" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Toate" })).toBeSelected();
    expect(await screen.findByText("3 înregistrări")).toBeOnTheScreen();
  });

  it("CA-15.1: Facturi shows only the invoices", async () => {
    await render(<HomeScreen />);
    await screen.findByText("Mega Image");

    await fireEvent.press(screen.getByRole("tab", { name: "Facturi" }));

    expect(apiFetchMock).toHaveBeenLastCalledWith("/api/documents?context=personal&type=INVOICES");
    expect(await screen.findByText("eMAG")).toBeOnTheScreen();
    expect(screen.queryByText("Mega Image")).toBeNull();
    expect(screen.queryByText("Piața Obor")).toBeNull();
    expect(screen.getByRole("tab", { name: "Facturi" })).toBeSelected();
  });

  it("CA-15.2: the number of records follows the filter", async () => {
    await render(<HomeScreen />);
    expect(await screen.findByText("3 înregistrări")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("tab", { name: "Manuale" }));

    expect(await screen.findByText("1 înregistrare")).toBeOnTheScreen();
  });

  it("a filter with nothing in it shows a dedicated empty card for that type", async () => {
    apiFetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ month: "2026-11", documents: [] }),
    }));
    await render(<HomeScreen />);

    await fireEvent.press(screen.getByRole("tab", { name: "Bonuri" }));
    expect(await screen.findByTestId("empty-documents-card")).toBeOnTheScreen();
    expect(screen.getByText("Nu ai bonuri în luna aceasta")).toBeOnTheScreen();
    expect(screen.getByText(HOME_MESSAGES.empty)).toBeOnTheScreen();
    expect(screen.getByText("0 înregistrări")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("tab", { name: "Facturi" }));
    expect(await screen.findByText("Nu ai facturi în luna aceasta")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("tab", { name: "Manuale" }));
    expect(await screen.findByText("Nu ai cheltuieli manuale în luna aceasta")).toBeOnTheScreen();
  });
});

describe("Acasă - totalul lunii și variația (US-05)", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date(2026, 10, 14, 12, 0),
      doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
    });
  });

  function makeSummary(overrides: Partial<MonthSummary> = {}): MonthSummary {
    return {
      month: "2026-11",
      total: "1234.50",
      count: 2,
      previousMonth: "2026-10",
      previousTotal: null,
      variationPercent: null,
      byCategory: [
        { category: "GROCERIES", categoryName: "Alimente", total: "800.00", percent: 65, count: 1 },
        { category: "TRANSPORT", categoryName: "Transport", total: "434.50", percent: 35, count: 1 },
      ],
      previousByCategory: [],
      ...overrides,
    };
  }

  it("CA-05.1 / CA-05.3: shows 'Cheltuit în noiembrie' and the exact total to the ban", async () => {
    respondWith(
      [doc("a", "Mega Image", "2026-11-14", "800.00"), doc("b", "Benzinărie", "2026-11-13", "434.50", "TRANSPORT")],
      makeSummary({ total: "1234.50" }),
    );

    await render(<HomeScreen />);

    expect(await screen.findByText("Cheltuit în noiembrie")).toBeOnTheScreen();
    expect(screen.getByTestId("month-summary-total")).toHaveTextContent("1.234,50 lei");
  });

  it("CA-05.2: shows a red variation badge when current month spending is higher than last month", async () => {
    respondWith(
      [doc("a", "Mega Image", "2026-11-14", "125.00")],
      makeSummary({ total: "125.00", previousTotal: "100.00", variationPercent: 25 }),
    );

    await render(<HomeScreen />);

    const badge = await screen.findByTestId("month-variation-badge");
    const variationText = screen.getByTestId("month-variation-text");
    expect(badge).toBeOnTheScreen();
    expect(variationText).toHaveTextContent("+25%");
    expect(variationText).toHaveStyle({ color: "#DC2626" });
    expect(screen.getByText("față de octombrie · 100,00 lei")).toBeOnTheScreen();
  });

  it("CA-05.2: shows a green variation badge when current month spending is lower than last month", async () => {
    respondWith(
      [doc("a", "Mega Image", "2026-11-14", "80.00")],
      makeSummary({ total: "80.00", previousTotal: "100.00", variationPercent: -20 }),
    );

    await render(<HomeScreen />);

    const variationText = await screen.findByTestId("month-variation-text");
    expect(variationText).toHaveTextContent("-20%");
    expect(variationText).toHaveStyle({ color: "#047857" });
  });

  it("CA-05.2: hides the variation badge and comparison panel when there is no previous month data", async () => {
    respondWith(
      [doc("a", "Mega Image", "2026-11-14", "50.00")],
      makeSummary({ total: "50.00", previousTotal: null, variationPercent: null }),
    );

    await render(<HomeScreen />);

    expect(await screen.findByText("Cheltuit în noiembrie")).toBeOnTheScreen();
    expect(screen.queryByTestId("month-variation-badge")).toBeNull();
    expect(screen.queryByTestId("month-comparison-panel")).toBeNull();
  });

  it("expands and collapses the colorful category breakdown on tap, showing both current and previous month categories", async () => {
    respondWith(
      [doc("a", "Mega Image", "2026-11-14", "800.00"), doc("b", "Benzinărie", "2026-11-13", "434.50", "TRANSPORT")],
      makeSummary({
        previousTotal: "500.00",
        variationPercent: 147,
        previousByCategory: [
          { category: "HEALTH", categoryName: "Sănătate", total: "500.00", percent: 100, count: 1 },
        ],
      }),
    );

    await render(<HomeScreen />);

    expect(await screen.findByTestId("month-category-bar")).toBeOnTheScreen();
    expect(screen.queryByTestId("month-category-breakdown")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Vezi pe categorii" }));
    expect(screen.getByTestId("month-category-breakdown")).toBeOnTheScreen();
    expect(screen.getByText("Luna curentă · noiembrie")).toBeOnTheScreen();
    expect(screen.getByTestId("month-previous-category-breakdown")).toBeOnTheScreen();
    expect(screen.getByText("Luna anterioară · octombrie")).toBeOnTheScreen();
    expect(screen.getByText("Sănătate")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Ascunde categoriile" }));
    expect(screen.queryByTestId("month-category-breakdown")).toBeNull();
  });

  it("hides statistics and shows an empty-statistics message when there are no expenses this month", async () => {
    respondWith(
      [],
      makeSummary({
        total: "0.00",
        count: 0,
        previousTotal: "200.00",
        variationPercent: -100,
        byCategory: [],
        previousByCategory: [{ category: "GROCERIES", categoryName: "Alimente", total: "200.00", percent: 100, count: 1 }],
      }),
    );

    await render(<HomeScreen />);

    expect(await screen.findByTestId("month-no-stats-message")).toBeOnTheScreen();
    expect(screen.getByText("Încă nu există statistici pentru noiembrie")).toBeOnTheScreen();
    expect(screen.queryByTestId("month-variation-badge")).toBeNull();
    expect(screen.queryByTestId("month-category-bar")).toBeNull();
    expect(screen.queryByTestId("month-quick-stats")).toBeNull();
    expect(screen.queryByRole("button", { name: "Statistici pe categorii" })).toBeNull();
  });

  it("highlights a category spotlight when tapping a category chip and clears it on second tap", async () => {
    respondWith(
      [doc("a", "Mega Image", "2026-11-14", "800.00"), doc("b", "Benzinărie", "2026-11-13", "434.50", "TRANSPORT")],
      makeSummary(),
    );

    await render(<HomeScreen />);
    await screen.findByTestId("month-category-bar");

    expect(screen.queryByTestId("month-category-spotlight")).toBeNull();

    const chips = screen.getAllByRole("button", { name: /Transport 35%/ });
    await fireEvent.press(chips[0]);
    expect(screen.getByTestId("month-category-spotlight")).toBeOnTheScreen();
    expect(screen.getByTestId("month-category-spotlight")).toHaveTextContent(/434,50 lei/);

    await fireEvent.press(chips[0]);
    expect(screen.queryByTestId("month-category-spotlight")).toBeNull();
  });

  it("shows a dynamic difference insight pill when previous month data exists", async () => {
    respondWith(
      [doc("a", "Mega Image", "2026-11-14", "80.00")],
      makeSummary({ total: "80.00", previousTotal: "100.00", variationPercent: -20 }),
    );

    await render(<HomeScreen />);

    expect(await screen.findByText("20,00 lei economisiți față de octombrie")).toBeOnTheScreen();
  });

  it("opens the full category statistics screen (US-16) when pressing Statistici pe categorii", async () => {
    respondWith(
      [doc("a", "Mega Image", "2026-11-14", "800.00"), doc("b", "Benzinărie", "2026-11-13", "434.50", "TRANSPORT")],
      makeSummary(),
    );

    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Statistici pe categorii" }));

    expect(router.push).toHaveBeenCalledWith("/statistics");
  });

  it("keeps the full month summary unchanged when switching document type filters", async () => {
    const fullSummary = makeSummary({ total: "352.76", previousTotal: "200.00", variationPercent: 76 });
    const receipt = { ...doc("1", "Mega Image", "2026-11-14", "18.28"), type: "SCANNED" };
    const invoice = { ...doc("2", "eMAG", "2026-11-14", "334.48", "SHOPPING"), type: "SCANNED_INVOICE" };
    apiFetchMock.mockImplementation(async (path: string) => {
      const type = new URLSearchParams(path.split("?")[1]).get("type");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          month: "2026-11",
          documents: type === "INVOICES" ? [invoice] : [receipt, invoice],
          summary: fullSummary,
        }),
      };
    });

    await render(<HomeScreen />);
    expect(await screen.findByTestId("month-summary-total")).toHaveTextContent("352,76 lei");

    await fireEvent.press(screen.getByRole("tab", { name: "Facturi" }));
    expect(await screen.findByText("eMAG")).toBeOnTheScreen();
    expect(screen.getByTestId("month-summary-total")).toHaveTextContent("352,76 lei");
    expect(screen.getByTestId("month-variation-text")).toHaveTextContent("+76%");
  });
});
