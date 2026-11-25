import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ExpenseDocument, MonthSummary } from "@ocrinvoice/shared";
import StatisticsScreen from "@/app/(app)/statistics";
import { apiFetch } from "@/lib/api";
import { HOME_MESSAGES } from "@/lib/expense-messages";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
const mockProfile = {
  activeContext: "personal" as "personal" | "company",
  company: { name: "Exemplu SRL" } as { name: string } | null,
};
jest.mock("@/lib/profile-context", () => ({
  useProfile: () => ({
    profile: { firstName: "Ana", lastName: "Popescu" },
    activeContext: mockProfile.activeContext,
    company: mockProfile.company,
  }),
}));

const apiFetchMock = apiFetch as unknown as jest.Mock;

function doc(
  id: string,
  merchant: string,
  date: string,
  total: string,
  category = "GROCERIES",
  lines: ExpenseDocument["lines"] = [],
): ExpenseDocument {
  return {
    id,
    context: "personal",
    type: lines.length > 0 ? "SCANNED" : "MANUAL",
    merchant,
    date,
    time: null,
    total,
    category,
    paymentMethod: "CARD",
    note: null,
    fileId: null,
    createdAt: `${date}T10:00:00.000Z`,
    lines,
  };
}

function respondWith(documents: ExpenseDocument[], summary: MonthSummary) {
  apiFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ month: summary.month, documents, summary }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile.activeContext = "personal";
});

describe("Statistici — cheltuielile pe categorii în luna curentă (US-16)", () => {
  it("CA-16.1 / CA-16.2: lists categories descending with amounts, percentages summing to 100%, and exact month total", async () => {
    const summary: MonthSummary = {
      month: "2026-11",
      total: "1000.00",
      count: 3,
      previousMonth: "2026-10",
      previousTotal: null,
      variationPercent: null,
      byCategory: [
        { category: "GROCERIES", categoryName: "Alimente", total: "550.00", percent: 55, count: 1 },
        { category: "cmbeauty12345678901234567", categoryName: "Beauty", total: "300.00", percent: 30, count: 1 },
        { category: "TRANSPORT", categoryName: "Transport", total: "150.00", percent: 15, count: 1 },
      ],
      previousByCategory: [],
    };
    respondWith(
      [
        doc("1", "Mega Image", "2026-11-14", "550.00", "GROCERIES"),
        doc("2", "Sephora", "2026-11-12", "300.00", "cmbeauty12345678901234567"),
        doc("3", "OMV", "2026-11-10", "150.00", "TRANSPORT"),
      ],
      summary,
    );

    await render(<StatisticsScreen />);

    expect(await screen.findByText("Cheltuieli în noiembrie")).toBeOnTheScreen();
    expect(screen.getByTestId("statistics-month-total")).toHaveTextContent("1.000,00 lei");
    expect(screen.getByTestId("statistics-percent-total")).toHaveTextContent("100%");
    expect(screen.getByTestId("statistics-top-insight")).toHaveTextContent(/Cea mai mare pondere: Alimente \(55% din total\)/);

    // CA-16.1: ordered descending (#1 Alimente, #2 Beauty, #3 Transport) with amount and percent.
    const row1 = screen.getByTestId("category-row-GROCERIES");
    const row2 = screen.getByTestId("category-row-cmbeauty12345678901234567");
    const row3 = screen.getByTestId("category-row-TRANSPORT");
    expect(row1).toHaveTextContent(/#1Alimente.*550,00 lei55%/);
    expect(row2).toHaveTextContent(/#2Beauty.*300,00 lei30%/);
    expect(row3).toHaveTextContent(/#3Transport.*150,00 lei15%/);

    // CA-16.2: footer confirms 100% and exact sum equals month total.
    expect(screen.getByTestId("statistics-total-footer")).toHaveTextContent(/Total noiembrie100%1\.000,00 lei/);
  });

  it("highlights a category on tap, drills down into its expenses (including receipt lines), and opens document detail", async () => {
    const beautyId = "cmbeauty12345678901234567";
    const summary: MonthSummary = {
      month: "2026-11",
      total: "100.00",
      count: 1,
      previousMonth: "2026-10",
      previousTotal: "200.00",
      variationPercent: -50,
      byCategory: [
        { category: "GROCERIES", categoryName: "Alimente", total: "70.00", percent: 70, count: 1 },
        { category: beautyId, categoryName: "Beauty", total: "30.00", percent: 30, count: 1 },
      ],
      previousByCategory: [
        { category: "HEALTH", categoryName: "Sănătate", total: "200.00", percent: 100, count: 1 },
      ],
    };
    respondWith(
      [
        doc("scan-1", "DM", "2026-11-14", "100.00", "GROCERIES", [
          { id: "l1", position: 1, name: "Apă", amount: "70.00", category: "GROCERIES" },
          { id: "l2", position: 2, name: "Cremă față", amount: "30.00", category: beautyId },
        ]),
      ],
      summary,
    );

    await render(<StatisticsScreen />);
    await fireEvent.press(await screen.findByTestId(`category-row-${beautyId}`));

    expect(screen.getByTestId("statistics-hero-spotlight")).toHaveTextContent(/Beauty30,00 lei30%/);
    const drilldown = screen.getByTestId(`category-drilldown-${beautyId}`);
    expect(drilldown).toHaveTextContent(/DM.*30,00 lei/);

    await fireEvent.press(screen.getByText("DM"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/document/[id]", params: { id: "scan-1" } });

    // Switch to previous month's category breakdown.
    await fireEvent.press(screen.getByRole("tab", { name: "Octombrie" }));
    expect(screen.getByText("Cheltuieli în octombrie")).toBeOnTheScreen();
    expect(screen.getByTestId("category-row-HEALTH")).toHaveTextContent(/Sănătate.*200,00 lei100%/);
  });

  it("shows an inviting empty state card when there are no expenses in the current month", async () => {
    respondWith([], {
      month: "2026-11",
      total: "0.00",
      count: 0,
      previousMonth: "2026-10",
      previousTotal: null,
      variationPercent: null,
      byCategory: [],
      previousByCategory: [],
    });

    await render(<StatisticsScreen />);

    expect(await screen.findByTestId("statistics-empty-card")).toBeOnTheScreen();
    expect(screen.getByText("Nu ai cheltuieli în noiembrie")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Adaugă o cheltuială" }));
    expect(router.push).toHaveBeenCalledWith("/add-expense");
  });

  it("loads the active company profile separately and shows error with retry on failure", async () => {
    mockProfile.activeContext = "company";
    apiFetchMock.mockRejectedValueOnce(new Error("network"));

    await render(<StatisticsScreen />);

    expect(apiFetchMock).toHaveBeenCalledWith("/api/documents?context=company&type=ALL");
    expect(await screen.findByText(HOME_MESSAGES.loadError)).toBeOnTheScreen();
    expect(screen.getByText("Exemplu SRL")).toBeOnTheScreen();
  });
});

