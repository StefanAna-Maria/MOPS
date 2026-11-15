import { describe, expect, it } from "vitest";
import { detectImageType } from "../src/lib/uploads.js";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

describe("detectImageType", () => {
  it("recognizes JPEG, PNG and WebP from their first bytes", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe("image/jpeg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe("image/png");
    expect(detectImageType(text("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it.each([
    ["a PDF", text("%PDF-1.7")],
    ["text", text("hello")],
    ["a RIFF file that is not WebP (e.g. WAV)", text("RIFF\0\0\0\0WAVEfmt ")],
    ["an empty file", bytes()],
    ["a cut-off JPEG header", bytes(0xff, 0xd8)],
  ])("rejects %s", (_case, value) => {
    expect(detectImageType(value)).toBeNull();
  });
});
