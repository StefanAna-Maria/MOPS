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

/** At most this many pages of a PDF without text are read as pictures (each picture costs ~1.7k tokens). */
export const PDF_MAX_PAGES = 4;

/** Pages drawn for reading together are a bit smaller, so that several fit in the OCR service's memory at once. */
export const PDF_PAGE_MAX_SIDE = 1600;

/** Below this many characters a PDF is treated as scanned (pictures of paper), not as a document with real text. */
export const PDF_MIN_TEXT_CHARS = 100;

function openPdf(bytes: Uint8Array): mupdf.Document {
  try {
    const document = mupdf.Document.openDocument(bytes, "application/pdf");
    if (document.needsPassword()) {
      document.destroy();
      throw new PdfError("The PDF is protected with a password");
    }
    if (document.countPages() < 1) {
      document.destroy();
      throw new PdfError("The PDF has no pages");
    }
    return document;
  } catch (error) {
    throw error instanceof PdfError ? error : new PdfError(error instanceof Error ? error.message : "Invalid PDF");
  }
}

/**
 * US-09: the text of every page of a PDF, or null when the PDF has (almost) no text — a scanned paper document.
 * Invoices from shops and marketplaces are usually generated PDFs with real text, which is read exactly instead of
 * being recognized from pixels, and which keeps every page (the picture made at upload shows only the first one).
 */
export function extractPdfText(bytes: Uint8Array): string[] | null {
  const document = openPdf(bytes);
  try {
    const pages: string[] = [];
    for (let i = 0; i < document.countPages(); i++) {
      const page = document.loadPage(i);
      pages.push(page.toStructuredText("preserve-whitespace").asText().replace(/[ \t]+\n/g, "\n").trim());
    }
    const characters = pages.reduce((sum, text) => sum + text.replace(/\s/g, "").length, 0);
    return characters >= PDF_MIN_TEXT_CHARS ? pages : null;
  } finally {
    document.destroy();
  }
}

/** US-09: every page of a PDF without text as a PNG (at most PDF_MAX_PAGES), to be read together. */
export function renderPagesAsPng(bytes: Uint8Array, maxPages = PDF_MAX_PAGES, maxSide = PDF_PAGE_MAX_SIDE): Uint8Array[] {
  const document = openPdf(bytes);
  try {
    const images: Uint8Array[] = [];
    const count = Math.min(document.countPages(), maxPages);
    for (let i = 0; i < count; i++) {
      const page = document.loadPage(i);
      const [left, top, right, bottom] = page.getBounds();
      const longSide = Math.max(right - left, bottom - top);
      if (!(longSide > 0)) {
        continue;
      }
      const scale = maxSide / longSide;
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
      images.push(pixmap.asPNG());
    }
    if (images.length === 0) {
      throw new PdfError("The PDF pages are empty");
    }
    return images;
  } finally {
    document.destroy();
  }
}

/** At most this many pages are stacked into the picture shown in the app. */
export const PDF_PICTURE_MAX_PAGES = 6;

/** Grey gap between stacked pages, in pixels, so the reader sees where one page ends. */
const PAGE_GAP = 12;

/**
 * US-09: every page of a PDF, one under another, as ONE PNG: the picture the app shows for a scanned document. A
 * 2-page invoice showed only its first page (2026-11-24). Each page is drawn at the same width, at most
 * PDF_PAGE_MAX_SIDE pixels on its long side. A one-page PDF gets the same picture as renderFirstPageAsPng.
 */
export function renderPdfPicture(bytes: Uint8Array): Uint8Array {
  const document = openPdf(bytes);
  let pageCount: number;
  try {
    pageCount = document.countPages();
  } finally {
    document.destroy();
  }
  if (pageCount <= 1) {
    return renderFirstPageAsPng(bytes);
  }

  const pages = openPdf(bytes);
  try {
    const count = Math.min(pageCount, PDF_PICTURE_MAX_PAGES);
    const [left, top, right, bottom] = pages.loadPage(0).getBounds();
    const firstWidth = right - left;
    const width = Math.round((PDF_PAGE_MAX_SIDE * firstWidth) / Math.max(firstWidth, bottom - top));

    const drawn: mupdf.Pixmap[] = [];
    for (let i = 0; i < count; i++) {
      const page = pages.loadPage(i);
      const [pl, , pr] = page.getBounds();
      const scale = width / Math.max(pr - pl, 1);
      drawn.push(page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true));
    }

    const height = drawn.reduce((sum, pixmap) => sum + pixmap.getHeight(), 0) + PAGE_GAP * (drawn.length - 1);
    const sheet = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
    sheet.clear(226); // the gaps stay light grey; every page covers its own area
    const target = sheet.getPixels();
    const targetStride = sheet.getStride();
    let y = 0;
    for (const pixmap of drawn) {
      const source = pixmap.getPixels();
      const sourceStride = pixmap.getStride();
      const rowBytes = Math.min(pixmap.getWidth(), width) * 3;
      for (let row = 0; row < pixmap.getHeight(); row++) {
        target.set(source.subarray(row * sourceStride, row * sourceStride + rowBytes), (y + row) * targetStride);
      }
      y += pixmap.getHeight() + PAGE_GAP;
    }
    return sheet.asPNG();
  } catch (error) {
    throw error instanceof PdfError ? error : new PdfError(error instanceof Error ? error.message : "Invalid PDF");
  } finally {
    pages.destroy();
  }
}
