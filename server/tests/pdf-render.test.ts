import { describe, expect, it } from "vitest";
import { PDF_RENDER_MAX_SIDE, PdfError, isPdf, renderFirstPageAsPng } from "../src/lib/pdf-render.js";
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
