import { Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { ExpenseDocument } from "@ocrinvoice/shared";
import DocumentScreen from "@/app/(app)/document/[id]";
import { apiFetch } from "@/lib/api";
import { DOCUMENT_MESSAGES } from "@/lib/expense-messages";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/auth-client", () => ({ authClient: { getCookie: jest.fn(async () => "session=abc") } }));

const apiFetchMock = apiFetch as unknown as jest.Mock;
const paramsMock = useLocalSearchParams as unknown as jest.Mock;

const document: ExpenseDocument = {
  id: "doc-1",
  context: "personal",
  type: "MANUAL",
  merchant: "Plată greșită",
  date: "2026-11-20",
  time: null,
  total: "50.00",
  category: "OTHER",
  paymentMethod: "CASH",
  note: null,
  fileId: null,
  createdAt: "2026-11-20T10:00:00.000Z",
  lines: [{ id: "l1", position: 1, name: "Plată greșită", amount: "50.00", category: "OTHER" }],
};

function respond(status: number, body?: unknown) {
  apiFetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
}

async function openDocument() {
  respond(200, { document });
  await render(<DocumentScreen />);
  await screen.findByRole("header", { name: "Plată greșită" });
}

beforeEach(() => {
  jest.clearAllMocks();
  paramsMock.mockReturnValue({ id: "doc-1" });
});

describe("Ștergerea unui document", () => {
  it("offers Șterge documentul on the document's detail", async () => {
    await openDocument();

    expect(screen.getByRole("button", { name: DOCUMENT_MESSAGES.delete })).toBeOnTheScreen();
  });

  it("CA-07.1: asks Ștergi documentul? before deleting anything", async () => {
    await openDocument();

    await fireEvent.press(screen.getByRole("button", { name: DOCUMENT_MESSAGES.delete }));

    expect(screen.getByText(DOCUMENT_MESSAGES.confirmTitle)).toBeOnTheScreen();
    expect(
      screen.getByText(DOCUMENT_MESSAGES.confirmText("Plată greșită, 50,00 lei, din 20.11.2026,")),
    ).toBeOnTheScreen();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("Renunță closes the question and keeps the document", async () => {
    await openDocument();
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENT_MESSAGES.delete }));

    await fireEvent.press(screen.getByRole("button", { name: DOCUMENT_MESSAGES.cancel }));

    expect(screen.queryByText(DOCUMENT_MESSAGES.confirmTitle)).toBeNull();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("CA-07.1: after confirming, deletes the document and goes back to the list", async () => {
    await openDocument();
    respond(204);
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENT_MESSAGES.delete }));

    await fireEvent.press(screen.getByRole("button", { name: DOCUMENT_MESSAGES.confirm }));

    expect(apiFetchMock).toHaveBeenLastCalledWith("/api/documents/doc-1", { method: "DELETE" });
    expect(router.back).toHaveBeenCalled();
  });

  it("CA-07.2: a document that is not the user's (404) is reported as not found", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await openDocument();
    respond(404, { code: "DOCUMENT_NOT_FOUND" });
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENT_MESSAGES.delete }));

    await fireEvent.press(screen.getByRole("button", { name: DOCUMENT_MESSAGES.confirm }));

    expect(alertSpy).toHaveBeenCalledWith(DOCUMENT_MESSAGES.notFound);
    expect(router.back).toHaveBeenCalled();
  });

  it("shows Serverul nu răspunde and keeps the document when the server cannot be reached", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await openDocument();
    apiFetchMock.mockRejectedValueOnce(new Error("Network request failed"));
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENT_MESSAGES.delete }));

    await fireEvent.press(screen.getByRole("button", { name: DOCUMENT_MESSAGES.confirm }));

    expect(alertSpy).toHaveBeenCalledWith("Serverul nu răspunde", expect.any(String));
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByRole("header", { name: "Plată greșită" })).toBeOnTheScreen();
  });
});
