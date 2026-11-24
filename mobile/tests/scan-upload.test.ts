import { ImageManipulator } from "expo-image-manipulator";
import { apiFetch } from "@/lib/api";
import { MAX_SCAN_SIDE, ScanUploadError, fetchScan, prepareScanImage, retryScan, uploadScan } from "@/lib/scan-upload";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));

// Stand-in for expo-file-system's File, which implements Blob (what Expo's fetch requires for uploads).
jest.mock("expo-file-system", () => ({
  File: class MockExpoFile extends Blob {
    uri: string;
    constructor(mockUri: string) {
      super([new Uint8Array([0xff, 0xd8, 0xff])]);
      this.uri = mockUri;
    }
    async bytes() {
      return new Uint8Array([0xff, 0xd8, 0xff]);
    }
  },
}));

const mockResize = jest.fn();
const mockRenderAsync = jest.fn();
const mockSaveAsync = jest.fn();

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: jest.fn(() => ({ resize: mockResize, renderAsync: mockRenderAsync, release: jest.fn() })),
  },
}));

const apiFetchMock = apiFetch as unknown as jest.Mock;
const manipulateMock = ImageManipulator.manipulate as unknown as jest.Mock;

function photoOfSize(width: number, height: number) {
  mockRenderAsync.mockResolvedValue({ width, height, saveAsync: mockSaveAsync, release: jest.fn() });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveAsync.mockResolvedValue({ uri: "file:///cache/prepared.jpg" });
  photoOfSize(1000, 1500);
});

describe("prepareScanImage", () => {
  it.each([
    [3024, 4032, { height: MAX_SCAN_SIDE }],
    [4032, 3024, { width: MAX_SCAN_SIDE }],
  ])("shrinks a %ix%i photo to at most 1536 px on its long side", async (width, height, resize) => {
    photoOfSize(width, height);

    const uri = await prepareScanImage("file:///cache/photo.jpg");

    expect(mockResize).toHaveBeenCalledWith(resize);
    expect(mockSaveAsync).toHaveBeenCalledWith({ format: "jpeg", compress: 0.85 });
    expect(uri).toBe("file:///cache/prepared.jpg");
  });

  it("does not enlarge a photo that is already small enough", async () => {
    photoOfSize(500, 1500);

    await prepareScanImage("file:///cache/photo.jpg");

    expect(mockResize).not.toHaveBeenCalled();
    expect(manipulateMock).toHaveBeenCalledWith("file:///cache/photo.jpg");
  });
});

describe("uploadScan", () => {
  it("CA-09.1: uploads the prepared photo and the profile as multipart form data", async () => {
    // Node's FormData cannot hold React Native's { uri, name, type } file object, so watch what is appended.
    const appendSpy = jest.spyOn(FormData.prototype, "append");
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ scan: { id: "scan-1", status: "PROCESSING" } }),
    });

    const scan = await uploadScan("file:///cache/photo.jpg", "company");

    expect(scan).toEqual({ id: "scan-1", status: "PROCESSING" });
    const [path, init, options] = apiFetchMock.mock.calls[0];
    expect(path).toBe("/api/scans");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    // Regression (found on a real phone): Expo's fetch throws "Unsupported FormDataPart implementation" for React
    // Native's old { uri, name, type } object, so the photo must be sent as a File (a Blob) with a byte reader.
    const [fieldName, part, fileName] = appendSpy.mock.calls.find(([name]) => name === "file") ?? [];
    expect(fieldName).toBe("file");
    expect(part).toMatchObject({ uri: "file:///cache/prepared.jpg" });
    expect(part).toBeInstanceOf(Blob);
    expect(typeof (part as unknown as { bytes: unknown }).bytes).toBe("function");
    expect(fileName).toBe("receipt.jpg");
    expect(appendSpy).toHaveBeenCalledWith("context", "company");
    expect(options.timeoutMs).toBeGreaterThan(10_000);
  });

  it("CA-14.2: uploads a PDF as it is, without shrinking it, under its own name", async () => {
    const appendSpy = jest.spyOn(FormData.prototype, "append");
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ scan: { id: "scan-2", status: "PROCESSING" } }),
    });

    const scan = await uploadScan("file:///cache/factura.pdf", "personal", { kind: "pdf", name: "factura.pdf" });

    expect(scan).toEqual({ id: "scan-2", status: "PROCESSING" });
    expect(manipulateMock).not.toHaveBeenCalled();
    const [, part, fileName] = appendSpy.mock.calls.find(([name]) => name === "file") ?? [];
    expect(part).toMatchObject({ uri: "file:///cache/factura.pdf" });
    expect(part).toBeInstanceOf(Blob);
    expect(fileName).toBe("factura.pdf");
    expect(appendSpy).toHaveBeenCalledWith("context", "personal");
  });

  it("CA-14.2: a PDF without a name is sent as document.pdf", async () => {
    const appendSpy = jest.spyOn(FormData.prototype, "append");
    apiFetchMock.mockResolvedValue({ ok: true, status: 202, json: async () => ({ scan: { id: "s" } }) });

    await uploadScan("file:///cache/x", "personal", { kind: "pdf" });

    const [, , fileName] = appendSpy.mock.calls.find(([name]) => name === "file") ?? [];
    expect(fileName).toBe("document.pdf");
  });

  it("CA-14.2: a picture from the gallery is shrunk like a photo", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 202, json: async () => ({ scan: { id: "s" } }) });
    photoOfSize(4032, 3024);

    await uploadScan("file:///cache/IMG_1.jpg", "personal", { kind: "image", name: "IMG_1.jpg" });

    expect(mockResize).toHaveBeenCalledWith({ width: MAX_SCAN_SIDE });
  });

  it("throws ScanUploadError with the server's code when the upload is refused", async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 413, json: async () => ({ code: "FILE_TOO_LARGE" }) });

    await expect(uploadScan("file:///cache/photo.jpg", "personal")).rejects.toEqual(
      new ScanUploadError("FILE_TOO_LARGE"),
    );
  });
});

describe("fetchScan", () => {
  it("returns the scan, or null when it does not exist", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ scan: { id: "s1", status: "DONE" } }) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

    expect(await fetchScan("s1")).toEqual({ id: "s1", status: "DONE" });
    expect(await fetchScan("missing")).toBeNull();
    expect(apiFetchMock).toHaveBeenCalledWith("/api/scans/s1");
  });
});

describe("retryScan", () => {
  it("CA-10.2: posts to /api/scans/:id/retry and returns the restarted scan", async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ scan: { id: "s1", status: "PROCESSING", stage: "READING" } }),
    });

    const restarted = await retryScan("s1");

    expect(restarted).toEqual({ id: "s1", status: "PROCESSING", stage: "READING" });
    expect(apiFetchMock).toHaveBeenCalledWith("/api/scans/s1/retry", { method: "POST" });
  });

  it("throws ScanUploadError NOT_FOUND on 404", async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

    await expect(retryScan("missing")).rejects.toEqual(new ScanUploadError("NOT_FOUND"));
  });
});
