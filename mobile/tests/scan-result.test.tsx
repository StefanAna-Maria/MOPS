import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { OcrReading, Scan } from "@ocrinvoice/shared";
import ScanResultScreen from "@/app/(app)/scan-result/[id]";
import { SCAN_MESSAGES } from "@/lib/expense-messages";
import { ScanUploadError, fetchScan, retryScan } from "@/lib/scan-upload";

jest.mock("@/lib/scan-upload", () => ({
  POLL_INTERVAL_MS: 2000,
  ScanUploadError: class MockScanUploadError extends Error {
    code: string;
    constructor(mockCode: string) {
      super(mockCode);
      this.code = mockCode;
    }
  },
  fetchScan: jest.fn(),
  retryScan: jest.fn(),
}));

const fetchScanMock = fetchScan as unknown as jest.Mock;
const retryScanMock = retryScan as unknown as jest.Mock;
const paramsMock = useLocalSearchParams as unknown as jest.Mock;

const reading: OcrReading = {
  merchant: { value: "Carrefour express", confidence: 0.98 },
  date: { value: "2026-11-12", confidence: 0.98 },
  time: { value: "17:58", confidence: 0.98 },
  total: { value: "26.17", confidence: 0.98 },
  paymentMethod: { value: "CARD", confidence: 0.98 },
  items: [
    {
      name: { value: "PARTY MIX MIXED 60G", confidence: 0.95 },
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

function scan(overrides: Partial<Scan>): Scan {
  return {
    id: "scan-1",
    context: "personal",
    status: "PROCESSING",
    stage: "READING",
    uploadedAt: "2026-11-15T15:00:00.000Z",
    reading: null,
    errorCode: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  paramsMock.mockReturnValue({ id: "scan-1" });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Citirea documentului (US-09 & US-10)", () => {
  it("CA-09.1 / CA-10.1: shows the 4 real stages while the server is reading the document", async () => {
    fetchScanMock.mockResolvedValue(scan({ status: "PROCESSING", stage: "READING" }));

    await render(<ScanResultScreen />);

    expect(fetchScanMock).toHaveBeenCalledWith("scan-1");
    expect(await screen.findByText("Încărcăm documentul")).toBeOnTheScreen();
    expect(screen.getByText("Citim documentul")).toBeOnTheScreen();
    expect(screen.getByText("Găsim magazinul, data și totalul")).toBeOnTheScreen();
    expect(screen.getByText("Extragem produsele")).toBeOnTheScreen();
    expect(screen.getByTestId("stage-done-UPLOADING")).toBeOnTheScreen();
    expect(screen.getByTestId("stage-active-READING")).toBeOnTheScreen();
    expect(screen.getByTestId("stage-pending-EXTRACTING_FIELDS")).toBeOnTheScreen();
    expect(screen.getByTestId("stage-pending-EXTRACTING_ITEMS")).toBeOnTheScreen();
  });

  it("CA-10.1: advances through the real stages reported by the server", async () => {
    fetchScanMock
      .mockResolvedValueOnce(scan({ status: "PROCESSING", stage: "UPLOADING" }))
      .mockResolvedValueOnce(scan({ status: "PROCESSING", stage: "READING" }))
      .mockResolvedValueOnce(scan({ status: "PROCESSING", stage: "EXTRACTING_FIELDS" }))
      .mockResolvedValueOnce(scan({ status: "PROCESSING", stage: "EXTRACTING_ITEMS" }));

    await render(<ScanResultScreen />);
    expect(await screen.findByTestId("stage-active-UPLOADING")).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(await screen.findByTestId("stage-active-READING")).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(await screen.findByTestId("stage-active-EXTRACTING_FIELDS")).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(await screen.findByTestId("stage-active-EXTRACTING_ITEMS")).toBeOnTheScreen();
  });

  it("CA-09.2: asks again every 2 seconds until the reading is done, then shows every value with its confidence", async () => {
    fetchScanMock
      .mockResolvedValueOnce(scan({ status: "PROCESSING" }))
      .mockResolvedValueOnce(scan({ status: "DONE", stage: null, reading }));
    await render(<ScanResultScreen />);
    expect(await screen.findByText(SCAN_MESSAGES.reading)).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(fetchScanMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Carrefour express")).toBeOnTheScreen();
    expect(screen.getByText("12.11.2026")).toBeOnTheScreen();
    expect(screen.getByText("17:58")).toBeOnTheScreen();
    expect(screen.getByText("26,17 lei")).toBeOnTheScreen();
    expect(screen.getByText("Card")).toBeOnTheScreen();
    expect(screen.getByText("PARTY MIX MIXED 60G")).toBeOnTheScreen();
    expect(screen.getByText("-3,20 lei")).toBeOnTheScreen();
    expect(screen.getAllByText("98%").length).toBe(5);
    expect(screen.getByText(SCAN_MESSAGES.totalMatches)).toBeOnTheScreen();
  });

  it("CA-09.2: says when the products do not add up to the total", async () => {
    fetchScanMock.mockResolvedValue(
      scan({
        status: "DONE",
        stage: null,
        reading: { ...reading, itemsTotal: "29.37", totalMatches: false, total: { value: "26.17", confidence: 0.4 } },
      }),
    );

    await render(<ScanResultScreen />);

    expect(await screen.findByText(`${SCAN_MESSAGES.totalDiffers} (29,37 lei).`)).toBeOnTheScreen();
    expect(screen.getByText("40%")).toBeOnTheScreen();
  });

  it.each([
    ["OCR_UNAVAILABLE"],
    ["OCR_TIMEOUT"],
    ["UNREADABLE"],
  ] as const)("CA-10.2: shows Documentul nu a putut fi citit. with Încearcă din nou when reading failed with %s", async (errorCode) => {
    fetchScanMock.mockResolvedValue(scan({ status: "FAILED", stage: null, errorCode }));

    await render(<ScanResultScreen />);

    expect(await screen.findByText("Documentul nu a putut fi citit.")).toBeOnTheScreen();
    expect(screen.getByText(SCAN_MESSAGES.failedReasons[errorCode])).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Încearcă din nou" })).toBeOnTheScreen();
  });

  it("CA-10.2: pressing Încearcă din nou retries the reading on the server and shows the result once done", async () => {
    fetchScanMock
      .mockResolvedValueOnce(scan({ status: "FAILED", stage: null, errorCode: "OCR_UNAVAILABLE" }))
      .mockResolvedValueOnce(scan({ status: "PROCESSING", stage: "READING" }))
      .mockResolvedValueOnce(scan({ status: "DONE", stage: null, reading }));
    retryScanMock.mockResolvedValueOnce(scan({ status: "PROCESSING", stage: "READING" }));

    await render(<ScanResultScreen />);
    expect(await screen.findByText("Documentul nu a putut fi citit.")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Încearcă din nou" }));

    expect(retryScanMock).toHaveBeenCalledWith("scan-1");
    expect(await screen.findByText("Citim documentul")).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(await screen.findByText("Carrefour express")).toBeOnTheScreen();
  });

  it("CA-10.2: stays on the failed screen when Încearcă din nou fails due to a network error", async () => {
    fetchScanMock.mockResolvedValueOnce(scan({ status: "FAILED", stage: null, errorCode: "OCR_UNAVAILABLE" }));
    retryScanMock.mockRejectedValueOnce(new ScanUploadError("HTTP_503"));

    await render(<ScanResultScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Încearcă din nou" }));

    expect(await screen.findByText("Documentul nu a putut fi citit.")).toBeOnTheScreen();
    expect(screen.getByText(SCAN_MESSAGES.failedReasons.NETWORK)).toBeOnTheScreen();
  });

  it("offers to photograph the document again after a failure", async () => {
    fetchScanMock.mockResolvedValue(scan({ status: "FAILED", stage: null, errorCode: "UNREADABLE" }));
    await render(<ScanResultScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: SCAN_MESSAGES.retake }));

    expect(router.replace).toHaveBeenCalledWith("/scan");
  });

  it("shows an error when the server cannot be reached", async () => {
    fetchScanMock.mockRejectedValue(new Error("Network request failed"));

    await render(<ScanResultScreen />);

    expect(await screen.findByText(SCAN_MESSAGES.failedReasons.NETWORK)).toBeOnTheScreen();
  });

  it("stops asking the server after leaving the screen", async () => {
    fetchScanMock.mockResolvedValue(scan({ status: "PROCESSING" }));
    const view = await render(<ScanResultScreen />);
    await screen.findByText(SCAN_MESSAGES.reading);

    await view.unmount();
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });

    expect(fetchScanMock).toHaveBeenCalledTimes(1);
  });
});
