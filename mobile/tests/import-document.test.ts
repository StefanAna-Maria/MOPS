import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { FILE_PICKER_TYPES, documentKind, pickFromFiles, pickFromGallery } from "@/lib/import-document";

jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

const launchImageLibrary = ImagePicker.launchImageLibraryAsync as unknown as jest.Mock;
const getDocument = DocumentPicker.getDocumentAsync as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Din galerie", () => {
  it("CA-14.1: opens the picture chooser for one picture", async () => {
    launchImageLibrary.mockResolvedValue({ canceled: true, assets: null });

    await pickFromGallery();

    expect(launchImageLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ["images"], allowsMultipleSelection: false }),
    );
  });

  it("returns the chosen picture", async () => {
    launchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cache/IMG_1.jpg", fileName: "IMG_1.jpg", mimeType: "image/jpeg" }],
    });

    expect(await pickFromGallery()).toEqual({
      status: "picked",
      document: { uri: "file:///cache/IMG_1.jpg", kind: "image", name: "IMG_1.jpg" },
    });
  });

  it("gives the picture a name when the system does not", async () => {
    launchImageLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///cache/x", fileName: null }] });

    const result = await pickFromGallery();

    expect(result).toMatchObject({ status: "picked", document: { name: "poza.jpg" } });
  });

  it("reports that nothing was chosen when the chooser is closed", async () => {
    launchImageLibrary.mockResolvedValue({ canceled: true, assets: null });

    expect(await pickFromGallery()).toEqual({ status: "cancelled" });
  });
});

describe("Din fișiere", () => {
  it("CA-14.1: opens the file chooser for PDFs and pictures (iOS: the file is copied into the cache)", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    getDocument.mockResolvedValue({ canceled: true, assets: null });

    await pickFromFiles();

    expect(FILE_PICKER_TYPES).toEqual(["application/pdf", "image/*"]);
    expect(getDocument).toHaveBeenCalledWith({
      type: ["application/pdf", "image/*"],
      multiple: false,
      copyToCacheDirectory: true,
    });
  });

  it("regression: on Android the file is not copied into the cache, whose copy expo-file-system refuses to read", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    getDocument.mockResolvedValue({ canceled: true, assets: null });

    await pickFromFiles();

    expect(getDocument).toHaveBeenCalledWith({
      type: ["application/pdf", "image/*"],
      multiple: false,
      copyToCacheDirectory: false,
    });
  });

  it("on Android a PDF is returned with the system's content:// address, ready to upload", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "content://com.android.providers.downloads.documents/document/12", name: "factura.pdf", mimeType: "application/pdf" }],
    });

    expect(await pickFromFiles()).toEqual({
      status: "picked",
      document: { uri: "content://com.android.providers.downloads.documents/document/12", kind: "pdf", name: "factura.pdf" },
    });
  });

  it("CA-14.1: returns a chosen PDF", async () => {
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cache/factura.pdf", name: "factura.pdf", mimeType: "application/pdf" }],
    });

    expect(await pickFromFiles()).toEqual({
      status: "picked",
      document: { uri: "file:///cache/factura.pdf", kind: "pdf", name: "factura.pdf" },
    });
  });

  it("CA-14.1: returns a chosen picture", async () => {
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cache/bon.png", name: "bon.png", mimeType: "image/png" }],
    });

    expect(await pickFromFiles()).toEqual({
      status: "picked",
      document: { uri: "file:///cache/bon.png", kind: "image", name: "bon.png" },
    });
  });

  it("refuses a file that is neither a PDF nor a picture", async () => {
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cache/notite.txt", name: "notite.txt", mimeType: "text/plain" }],
    });

    expect(await pickFromFiles()).toEqual({ status: "unsupported" });
  });

  it("reports that nothing was chosen when the chooser is closed", async () => {
    getDocument.mockResolvedValue({ canceled: true, assets: null });

    expect(await pickFromFiles()).toEqual({ status: "cancelled" });
  });
});

describe("documentKind", () => {
  it.each([
    ["application/pdf", "factura.pdf", "pdf"],
    ["application/pdf", "fara-extensie", "pdf"],
    ["APPLICATION/PDF", "FACTURA.PDF", "pdf"],
    [undefined, "factura.pdf", "pdf"],
    ["application/octet-stream", "factura.pdf", "pdf"],
    ["image/jpeg", "bon.jpg", "image"],
    ["image/png", "bon", "image"],
    ["image/heic", "IMG_2.HEIC", "image"],
    [undefined, "bon.jpeg", "image"],
    [undefined, "bon.webp", "image"],
    ["text/plain", "notite.txt", null],
    ["application/zip", "arhiva.zip", null],
    [undefined, "fara-extensie", null],
    [null, null, null],
  ])("%s / %s is %s", (mimeType, name, kind) => {
    expect(documentKind(mimeType, name)).toBe(kind);
  });

  it("does not take an image named .pdf for a PDF", () => {
    expect(documentKind("image/png", "poza.pdf")).toBe("image");
  });
});
