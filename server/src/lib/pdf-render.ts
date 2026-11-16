import * as mupdf from "mupdf";

/** The longest side of the image made from a PDF page, in pixels: the same limit the app puts on photos. */
export const PDF_RENDER_MAX_SIDE = 2048;

/** A PDF that cannot be turned into a picture: damaged, protected with a password, or without pages. */
export class PdfError extends Error {}

/** Whether the bytes start like a PDF ("%PDF-"). */
export function isPdf(bytes: Uint8Array) {
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);
}

/**
 * US-14: draws the first page of a PDF as a PNG (at most PDF_RENDER_MAX_SIDE pixels on the long side), so a PDF is
 * read by the OCR service exactly like a photo. Throws PdfError when the PDF cannot be opened.
 */
export function renderFirstPageAsPng(bytes: Uint8Array): Uint8Array {
  let document: mupdf.Document | undefined;
  try {
    document = mupdf.Document.openDocument(bytes, "application/pdf");
    if (document.needsPassword()) {
      throw new PdfError("The PDF is protected with a password");
    }
    if (document.countPages() < 1) {
      throw new PdfError("The PDF has no pages");
    }
    const page = document.loadPage(0);
    const [left, top, right, bottom] = page.getBounds();
    const longSide = Math.max(right - left, bottom - top);
    if (!(longSide > 0)) {
      throw new PdfError("The PDF page is empty");
    }
    const scale = PDF_RENDER_MAX_SIDE / longSide;
    // No transparency: a transparent background would be read as black by the OCR service.
    const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    return pixmap.asPNG();
  } catch (error) {
    throw error instanceof PdfError ? error : new PdfError(error instanceof Error ? error.message : "Invalid PDF");
  } finally {
    document?.destroy();
  }
}
