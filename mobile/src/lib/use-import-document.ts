import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { IMPORT_MESSAGES } from "./expense-messages";
import { pickFromFiles, pickFromGallery, type PickResult } from "./import-document";
import { useProfile } from "./profile-context";
import { ScanUploadError, uploadScan } from "./scan-upload";

export type ImportSource = "gallery" | "files";

/**
 * US-14: "Din galerie" and "Din fișiere". The chosen picture or PDF is uploaded at once and the reading screen
 * opens (CA-14.2): there is no preview step, the document goes straight to reading like a photo does.
 */
export function useImportDocument() {
  const { activeContext } = useProfile();
  const [importing, setImporting] = useState<ImportSource | null>(null);

  async function run(source: ImportSource, pick: () => Promise<PickResult>) {
    if (importing) {
      return;
    }
    setImporting(source);
    try {
      const result = await pick();
      if (result.status === "cancelled") {
        return;
      }
      if (result.status === "unsupported") {
        Alert.alert(IMPORT_MESSAGES.unsupportedTitle, IMPORT_MESSAGES.unsupported);
        return;
      }
      const { uri, kind, name } = result.document;
      const scan = await uploadScan(uri, activeContext, { kind, name });
      router.replace({ pathname: "/scan-result/[id]", params: { id: scan.id } });
    } catch (error) {
      console.warn("Document import failed:", error instanceof Error ? `${error.name}: ${error.message}` : error);
      const reason = error instanceof ScanUploadError ? IMPORT_MESSAGES.failedReasons[error.code] : undefined;
      Alert.alert(IMPORT_MESSAGES.failedTitle, reason ?? IMPORT_MESSAGES.failed);
    } finally {
      setImporting(null);
    }
  }

  return {
    importing,
    importFromGallery: () => run("gallery", pickFromGallery),
    importFromFiles: () => run("files", pickFromFiles),
  };
}
