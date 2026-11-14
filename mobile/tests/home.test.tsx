import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ExpenseDocument } from "@ocrinvoice/shared";
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
    createdAt: `${date}T10:00:00.000Z`,
    lines: [],
  };
}

function respondWith(documents: ExpenseDocument[]) {
  apiFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ month: "2026-11", documents }) });
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
});

describe("Acasă - cheltuielile lunii", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 14, 12, 0), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  });

  it("CA-04.1: loads this month's documents from the server", async () => {
    await render(<HomeScreen />);

    expect(apiFetchMock).toHaveBeenCalledWith("/api/documents?context=personal");
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
    expect(screen.getAllByText("12,50 lei")).toHaveLength(2);
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

    expect(apiFetchMock).toHaveBeenCalledWith("/api/documents?context=company");
    expect(apiFetchMock).not.toHaveBeenCalledWith("/api/documents?context=personal");
  });

  it("reloads the list for the other profile after switching, without showing the old one", async () => {
    respondWith([doc("p", "Cumpărături personale", "2026-11-14", "10.00")]);
    const view = await render(<HomeScreen />);
    expect(await screen.findByText("Cumpărături personale")).toBeOnTheScreen();

    let resolveCompany: (value: unknown) => void = () => {};
    apiFetchMock.mockReturnValueOnce(new Promise((resolve) => (resolveCompany = resolve)));
    mockProfile.activeContext = "company";
    await view.rerender(<HomeScreen />);

    expect(apiFetchMock).toHaveBeenLastCalledWith("/api/documents?context=company");
    expect(screen.queryByText("Cumpărături personale")).toBeNull();

    resolveCompany({
      ok: true,
      status: 200,
      json: async () => ({ documents: [{ ...doc("c", "Consumabile birou", "2026-11-14", "20.00"), context: "company" }] }),
    });
    expect(await screen.findByText("Consumabile birou")).toBeOnTheScreen();
  });
});
