import { describe, expect, it } from "vitest";
import {
  PDF_MAX_PAGES,
  PDF_PAGE_MAX_SIDE,
  PDF_RENDER_MAX_SIDE,
  PdfError,
  extractPdfText,
  isPdf,
  renderFirstPageAsPng,
  renderPagesAsPng,
  renderPdfPicture,
} from "../src/lib/pdf-render.js";
import { detectImageType } from "../src/lib/uploads.js";
import { makePdf, pngSize } from "./pdf-fixture.js";

describe("isPdf", () => {
  it("recognises a PDF by its first bytes", () => {
    expect(isPdf(makePdf())).toBe(true);
  });

  it.each([
    ["text", new TextEncoder().encode("not a pdf")],
    ["an empty file", new Uint8Array()],
    ["a JPEG", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
  ])("does not take %s for a PDF", (_case, bytes) => {
    expect(isPdf(bytes)).toBe(false);
  });
});

describe("renderFirstPageAsPng", () => {
  it("CA-14.2: turns a PDF into a PNG picture", () => {
    const png = renderFirstPageAsPng(makePdf());

    expect(detectImageType(png)).toBe("image/png");
  });

  it("makes the long side of the picture PDF_RENDER_MAX_SIDE pixels, whatever the page size", () => {
    const receipt = pngSize(renderFirstPageAsPng(makePdf([{ width: 226, height: 600, text: "BON" }])));
    const a4 = pngSize(renderFirstPageAsPng(makePdf([{ width: 595, height: 842, text: "FACTURA" }])));
    const landscape = pngSize(renderFirstPageAsPng(makePdf([{ width: 842, height: 595, text: "FACTURA" }])));

    expect(receipt.height).toBe(PDF_RENDER_MAX_SIDE);
    expect(a4.height).toBe(PDF_RENDER_MAX_SIDE);
    expect(landscape.width).toBe(PDF_RENDER_MAX_SIDE);
    expect(receipt.width / receipt.height).toBeCloseTo(226 / 600, 2);
  });

  it("uses only the first page of a PDF with several pages", () => {
    const first = renderFirstPageAsPng(makePdf([{ width: 300, height: 600, text: "PRIMA" }]));
    const withTwoPages = renderFirstPageAsPng(
      makePdf([
        { width: 300, height: 600, text: "PRIMA" },
        { width: 595, height: 842, text: "A DOUA" },
      ]),
    );

    expect(pngSize(withTwoPages)).toEqual(pngSize(first));
    expect(Buffer.from(withTwoPages).equals(Buffer.from(first))).toBe(true);
  });

  it("draws something: the page is not a blank picture", () => {
    const blank = renderFirstPageAsPng(makePdf([{ width: 226, height: 600, text: "" }]));
    const written = renderFirstPageAsPng(makePdf([{ width: 226, height: 600, text: "TOTAL 26,17" }]));

    expect(Buffer.from(written).equals(Buffer.from(blank))).toBe(false);
  });

  it.each([
    ["text that only starts like a PDF", new TextEncoder().encode("%PDF-1.7 not really")],
    ["a truncated PDF", makePdf().slice(0, 30)],
    ["garbage", new Uint8Array([1, 2, 3, 4])],
  ])("throws PdfError for %s", (_case, bytes) => {
    expect(() => renderFirstPageAsPng(bytes)).toThrow(PdfError);
  });
});

describe("US-09: reading every page of a PDF", () => {
  // Short lines: at the fixture's 24 pt font a long line runs past the page edge and is cut.
  const page1 = "Factura VAIE102059 VANESSE SARL";
  const page2 = "Incarcator 100W 166,00 TVA 33,20";
  const page3 = "Total de plata 184,20 RON card";
  // Enough text in all (over PDF_MIN_TEXT_CHARS) to count as a generated PDF, not a scan.
  const filler = { width: 595, height: 842, text: "Furnizor CIF RO12345678 Cluj" };

  it("returns the text of every page of a PDF with real text", () => {
    const pages = extractPdfText(
      makePdf([
        { width: 595, height: 842, text: page1 },
        { width: 595, height: 842, text: page2 },
        { width: 595, height: 842, text: page3 },
        filler,
        filler,
      ]),
    );

    expect(pages).toHaveLength(5);
    expect(pages?.[0]).toContain("VANESSE SARL");
    expect(pages?.[2]).toContain("184,20");
  });

  it("returns null for a PDF with (almost) no text, like a scanned paper invoice", () => {
    expect(extractPdfText(makePdf())).toBeNull();
  });

  it("draws every page of a PDF without text, up to PDF_MAX_PAGES, at most PDF_PAGE_MAX_SIDE pixels", () => {
    const six = Array.from({ length: 6 }, () => ({ width: 595, height: 842, text: "X" }));

    const images = renderPagesAsPng(makePdf(six));

    expect(images).toHaveLength(PDF_MAX_PAGES);
    for (const image of images) {
      expect(detectImageType(image)).toBe("image/png");
      expect(pngSize(image).height).toBe(PDF_PAGE_MAX_SIDE);
    }
  });

  it("refuses a damaged PDF with PdfError", () => {
    expect(() => extractPdfText(makePdf().slice(0, 40))).toThrow(PdfError);
    expect(() => renderPagesAsPng(makePdf().slice(0, 40))).toThrow(PdfError);
  });
});

describe("US-09: the picture of a multi-page PDF shows every page", () => {
  it("stacks the pages one under another, at the same width, with a gap between them", () => {
    const a4 = { width: 595, height: 842, text: "X" };

    const png = renderPdfPicture(makePdf([a4, a4]));

    const size = pngSize(png);
    const width = Math.round((PDF_PAGE_MAX_SIDE * 595) / 842);
    expect(size.width).toBe(width);
    // Two pages of width × (842/595) each, plus the gap: more than twice one page.
    const onePage = Math.round((width * 842) / 595);
    expect(size.height).toBeGreaterThan(2 * onePage);
    expect(size.height).toBeLessThan(2 * onePage + 40);
  });

  it("keeps the picture of a one-page PDF exactly as before (first page, 2048 px)", () => {
    const pdf = makePdf();

    expect(renderPdfPicture(pdf)).toEqual(renderFirstPageAsPng(pdf));
  });
});
