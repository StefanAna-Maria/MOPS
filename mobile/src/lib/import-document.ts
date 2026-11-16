import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

/** A picture or PDF chosen from the phone (US-14). `uri` is a file in the app's cache, ready to upload. */
export type PickedDocument = {
  uri: string;
  kind: "image" | "pdf";
  name: string;
};

/** The file types "Din fișiere" offers: PDFs and pictures (CA-14.1). */
export const FILE_PICKER_TYPES = ["application/pdf", "image/*"];

/** What a pick can end in: a document, nothing (the user closed the picker) or a file that is not a PDF/picture. */
export type PickResult = { status: "picked"; document: PickedDocument } | { status: "cancelled" } | { status: "unsupported" };

/** The kind of a chosen file, from the type the system reports and, failing that, from its name; null if neither. */
export function documentKind(mimeType: string | null | undefined, name: string | null | undefined): "image" | "pdf" | null {
  const type = mimeType?.toLowerCase() ?? "";
  const lowerName = name?.toLowerCase() ?? "";
  if (type === "application/pdf" || (!type.startsWith("image/") && lowerName.endsWith(".pdf"))) {
    return "pdf";
  }
  if (type.startsWith("image/")) {
    return "image";
  }
  if (!type && /\.(jpe?g|png|webp|heic|heif)$/.test(lowerName)) {
    return "image";
  }
  return null;
}

/** CA-14.1 "Din galerie": opens the system picture chooser. */
export async function pickFromGallery(): Promise<PickResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    quality: 1,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) {
    return { status: "cancelled" };
  }
  return { status: "picked", document: { uri: asset.uri, kind: "image", name: asset.fileName ?? "poza.jpg" } };
}

/** CA-14.1 "Din fișiere": opens the system file chooser, which accepts PDFs and pictures. */
export async function pickFromFiles(): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: FILE_PICKER_TYPES,
    multiple: false,
    // Android: the picker's copy in the cache cannot be read back by expo-file-system (in Expo Go the cache holds
    // every app's sandbox, so the read is refused: "Missing 'READ' permission", found on a real phone with a PDF).
    // The system's own content:// address of the file is read directly instead. iOS keeps the copy.
    copyToCacheDirectory: Platform.OS !== "android",
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) {
    return { status: "cancelled" };
  }
  const kind = documentKind(asset.mimeType, asset.name);
  if (!kind) {
    return { status: "unsupported" };
  }
  return { status: "picked", document: { uri: asset.uri, kind, name: asset.name } };
}
