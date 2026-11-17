import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where uploaded photos are kept (UPLOAD_DIR, default "uploads" next to the server). Never inside git. */
export function uploadDir() {
  return path.resolve(process.env.UPLOAD_DIR || "uploads");
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Builds the storage key "<userId>/<fileId>.jpg"; both parts are server-generated ids, never user input. */
export function storageKeyFor(userId: string, fileId: string, mimeType: string) {
  return `${userId}/${fileId}.${EXTENSIONS[mimeType] ?? "bin"}`;
}

function resolveKey(storageKey: string) {
  const root = uploadDir();
  const full = path.resolve(root, storageKey);
  if (!full.startsWith(root + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return full;
}

export async function saveUpload(storageKey: string, bytes: Uint8Array) {
  const full = resolveKey(storageKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

export function readUpload(storageKey: string) {
  return readFile(resolveKey(storageKey));
}

/** The image type from the file's first bytes (its "magic number"), or null when it is not a JPEG, PNG or WebP. */
export function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const startsWith = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length && signature.every((byte, i) => bytes[offset + i] === byte);
  if (startsWith([0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // "RIFF" .... "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}
