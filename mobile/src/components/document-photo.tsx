import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch } from "@/lib/api";
import { REVIEW_MESSAGES } from "@/lib/expense-messages";
import { colors, radius, spacing, typography } from "@/constants/theme";

/** Bytes → base64, in chunks (a receipt photo is a few hundred KB). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

type PhotoState = { status: "loading" } | { status: "error" } | { status: "ok"; uri: string };

/** Width / height before the photo reports its real size (a typical receipt is about this narrow). */
const RECEIPT_ASPECT_RATIO = 0.6;

/**
 * The photo of a scanned document. It is downloaded with apiFetch, which sends the session: Android's image loader
 * ignores custom headers, so `<Image source={{ uri, headers: { Cookie } }}>` got 401 and showed a white box
 * (2026-11-24). Shown at its real proportions; tapping it opens it full screen.
 */
export function DocumentPhoto({ fileId }: { fileId: string }) {
  const [state, setState] = useState<PhotoState>({ status: "loading" });
  const [fullScreen, setFullScreen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(RECEIPT_ASPECT_RATIO);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const response = await apiFetch(`/api/scans/${encodeURIComponent(fileId)}/image`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const type = response.headers.get("Content-Type") ?? "image/jpeg";
        const uri = `data:${type};base64,${bytesToBase64(new Uint8Array(await response.arrayBuffer()))}`;
        if (!ignore) {
          setState({ status: "ok", uri });
        }
      } catch {
        if (!ignore) {
          setState({ status: "error" });
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [fileId]);

  if (state.status === "loading") {
    return (
      <View style={[styles.frame, styles.placeholder]}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Se încarcă poza" />
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View style={[styles.frame, styles.placeholder]}>
        <Text style={styles.message}>{REVIEW_MESSAGES.photoUnavailable}</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={REVIEW_MESSAGES.photo}
        accessibilityHint={REVIEW_MESSAGES.photoOpen}
        onPress={() => setFullScreen(true)}
      >
        <Image
          source={{ uri: state.uri }}
          resizeMode="contain"
          style={[styles.frame, { aspectRatio }]}
          // Real proportions, so a long receipt is not squeezed into a fixed box.
          onLoad={(event) => {
            const { width, height } = event.nativeEvent.source ?? {};
            if (width > 0 && height > 0) {
              setAspectRatio(width / height);
            }
          }}
          testID="document-photo"
        />
        <Text style={styles.hint}>{REVIEW_MESSAGES.photoOpen}</Text>
      </Pressable>
      <Modal visible={fullScreen} animationType="fade" onRequestClose={() => setFullScreen(false)}>
        <SafeAreaView style={styles.fullScreen}>
          <Image source={{ uri: state.uri }} resizeMode="contain" style={styles.fullImage} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={REVIEW_MESSAGES.photoClose}
            onPress={() => setFullScreen(false)}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Text style={styles.closeText}>{REVIEW_MESSAGES.photoClose}</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  hint: {
    ...typography.bodySm,
    marginTop: spacing.xs,
    textAlign: "center",
    color: colors.textSecondary,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: "#000000",
  },
  fullImage: {
    flex: 1,
    width: "100%",
  },
  close: {
    margin: spacing.lg,
    height: 48,
    borderRadius: radius.base,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  pressed: {
    opacity: 0.7,
  },
  closeText: {
    ...typography.button,
    color: colors.white,
  },
});
