import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useIsFocused } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppLoader } from "@/components/app-loader";
import { Card } from "@/components/card";
import { PrimaryButton } from "@/components/primary-button";
import {
  DOCUMENT_FRAME_ASPECT_RATIO,
  DOCUMENT_FRAME_MAX_WIDTH,
  cropPhotoToDocumentFrame,
  getDefaultDocumentFrameRect,
  type Rect,
  type Size,
} from "@/lib/crop-frame";
import { ImportButton } from "@/components/import-button";
import { IMPORT_MESSAGES, SCAN_MESSAGES } from "@/lib/expense-messages";
import { useImportDocument } from "@/lib/use-import-document";
import { useProfile } from "@/lib/profile-context";
import { uploadScan } from "@/lib/scan-upload";
import { colors, radius, spacing, typography } from "@/constants/theme";
import { useT } from "@/i18n";

const CORNER_SIZE = 28;
const CORNER_THICKNESS = 4;

export default function ScanScreen() {
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const windowDimensions = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);

  const { activeContext } = useProfile();
  const { importing, importFromGallery, importFromFiles } = useImportDocument();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState !== "background");

  const [viewportSize, setViewportSize] = useState<Size | null>(null);
  const [hudOffset, setHudOffset] = useState({ x: 0, y: 0 });
  const [sectionOffset, setSectionOffset] = useState({ x: 0, y: 0 });
  const [frameBox, setFrameBox] = useState<Rect | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(nextState === "active");
    });
    return () => {
      subscription.remove();
    };
  }, []);

  function handleCameraRootLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setViewportSize({ width, height });
  }

  function handleHudLayout(event: LayoutChangeEvent) {
    const { x, y } = event.nativeEvent.layout;
    setHudOffset({ x, y });
  }

  function handleSectionLayout(event: LayoutChangeEvent) {
    const { x, y } = event.nativeEvent.layout;
    setSectionOffset({ x, y });
  }

  function handleFrameLayout(event: LayoutChangeEvent) {
    const { x, y, width, height } = event.nativeEvent.layout;
    setFrameBox({ x, y, width, height });
  }

  if (!permission) {
    return <AppLoader />;
  }

  if (!permission.granted) {
    const isPermanentlyDenied = permission.status === "denied" && !permission.canAskAgain;

    return (
      <SafeAreaView style={styles.permissionSafeArea}>
        <View style={styles.permissionContainer}>
          <Card>
            <View style={styles.permissionHeader}>
              <View style={styles.iconCircle}>
                <Ionicons name="camera-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.permissionTitle} accessibilityRole="header">
                Acces la cameră
              </Text>
              <Text style={styles.permissionDescription}>
                {isPermanentlyDenied
                  ? t.camera.permissionDenied
                  : t.camera.permissionNeeded}
              </Text>
            </View>
            <View style={styles.permissionActions}>
              {isPermanentlyDenied ? (
                <PrimaryButton
                  title={t.camera.openSettings}
                  onPress={() => {
                    void Linking.openSettings();
                  }}
                />
              ) : (
                <PrimaryButton
                  title={t.camera.allow}
                  onPress={() => {
                    void requestPermission();
                  }}
                />
              )}
              <PrimaryButton
                title={IMPORT_MESSAGES.gallery}
                variant="outline"
                onPress={() => void importFromGallery()}
                loading={importing === "gallery"}
                disabled={importing !== null}
              />
              <PrimaryButton
                title={IMPORT_MESSAGES.files}
                variant="outline"
                onPress={() => void importFromFiles()}
                loading={importing === "files"}
                disabled={importing !== null}
              />
              <PrimaryButton title={t.common.back} variant="outline" onPress={() => router.back()} />
            </View>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  async function handleTakePicture() {
    if (!cameraRef.current || isTakingPicture) {
      return;
    }
    setIsTakingPicture(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        const activeViewport: Size =
          viewportSize && viewportSize.width > 0 && viewportSize.height > 0
            ? viewportSize
            : { width: windowDimensions.width || 390, height: windowDimensions.height || 844 };

        const activeFrameRect: Rect =
          frameBox && frameBox.width > 0 && frameBox.height > 0
            ? {
                x: hudOffset.x + sectionOffset.x + frameBox.x,
                y: hudOffset.y + sectionOffset.y + frameBox.y,
                width: frameBox.width,
                height: frameBox.height,
              }
            : getDefaultDocumentFrameRect(activeViewport);

        const croppedUri = await cropPhotoToDocumentFrame(
          {
            uri: photo.uri,
            width: photo.width ?? 0,
            height: photo.height ?? 0,
          },
          activeViewport,
          activeFrameRect,
        );
        setPhotoUri(croppedUri);
      }
    } catch {
      Alert.alert(t.camera.pictureFailedTitle, t.common.tryAgain);
    } finally {
      setIsTakingPicture(false);
    }
  }

  function handleRetake() {
    setPhotoUri(null);
  }

  // US-09 (CA-09.1): upload the photo; the server reads it in the background and the next screen waits for it.
  async function handleContinue() {
    if (!photoUri || isUploading) {
      return;
    }
    setIsUploading(true);
    try {
      const scan = await uploadScan(photoUri, activeContext);
      router.replace({ pathname: "/scan-result/[id]", params: { id: scan.id } });
    } catch (error) {
      // Visible in the Expo/Metro log: tells a refused upload (its server code) from a network or image error.
      console.warn("Scan upload failed:", error instanceof Error ? `${error.name}: ${error.message}` : error);
      Alert.alert(SCAN_MESSAGES.uploadFailedTitle, SCAN_MESSAGES.uploadFailed);
    } finally {
      setIsUploading(false);
    }
  }

  if (photoUri) {
    return (
      <SafeAreaView style={styles.previewSafeArea} edges={["top", "left", "right"]}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.camera.close}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
          <Text style={styles.topBarTitle} accessibilityRole="header">
            Verifică poza
          </Text>
          <View style={styles.topBarSpacer} />
        </View>

        <View style={styles.previewImageContainer}>
          <View style={styles.previewFrame}>
            <Image
              source={{ uri: photoUri }}
              style={styles.previewImage}
              resizeMode="cover"
              accessibilityLabel={t.review.photo}
              testID="captured-photo"
            />
          </View>
        </View>

        <SafeAreaView edges={["bottom"]} style={styles.previewFooter}>
          <Text style={styles.previewHint}>
            {isUploading
              ? SCAN_MESSAGES.stages.UPLOADING
              : t.camera.previewHint}
          </Text>
          <View style={styles.previewActions}>
            <View style={styles.actionItem}>
              <PrimaryButton title={t.camera.retake} variant="outline" onPress={handleRetake} disabled={isUploading} />
            </View>
            <View style={styles.actionItem}>
              <PrimaryButton title={t.common.continue} onPress={handleContinue} loading={isUploading} />
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaView>
    );
  }

  const isCameraActive = isFocused && isAppActive;

  return (
    <View style={styles.cameraRoot} onLayout={handleCameraRootLayout}>
      {isCameraActive ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          active={isCameraActive}
          testID="camera-view"
        />
      ) : null}

      <SafeAreaView
        style={styles.hudOverlay}
        edges={["top", "bottom", "left", "right"]}
        onLayout={handleHudLayout}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.camera.close}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
          <Text style={styles.topBarTitle} accessibilityRole="header">
            Fotografiază bonul
          </Text>
          <View style={styles.topBarSpacer} />
        </View>

        <View style={styles.viewfinderSection} onLayout={handleSectionLayout}>
          <View
            style={styles.documentFrame}
            onLayout={handleFrameLayout}
            accessibilityLabel={t.camera.frame}
            testID="document-frame"
          >
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
          <View style={styles.guidanceBadge}>
            <Text style={styles.guidanceText}>{t.camera.guidance}</Text>
          </View>
        </View>

        <View style={styles.shutterBar}>
          <View style={styles.shutterSide}>
            <ImportButton
              title={IMPORT_MESSAGES.gallery}
              icon="images-outline"
              onPress={() => void importFromGallery()}
              loading={importing === "gallery"}
              disabled={importing !== null || isTakingPicture}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.camera.shutter}
            accessibilityState={{ disabled: isTakingPicture || importing !== null }}
            disabled={isTakingPicture || importing !== null}
            onPress={() => {
              void handleTakePicture();
            }}
            testID="shutter-button"
            style={({ pressed }) => [
              styles.shutterOuter,
              pressed && styles.shutterPressed,
              isTakingPicture && styles.shutterDisabled,
            ]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <View style={styles.shutterSide}>
            <ImportButton
              title={IMPORT_MESSAGES.files}
              icon="document-outline"
              onPress={() => void importFromFiles()}
              loading={importing === "files"}
              disabled={importing !== null || isTakingPicture}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  permissionSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  permissionHeader: {
    alignItems: "center",
    gap: spacing.md,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  permissionTitle: {
    ...typography.headlineLg,
    color: colors.textPrimary,
    textAlign: "center",
  },
  permissionDescription: {
    ...typography.bodyLg,
    color: colors.textSecondary,
    textAlign: "center",
  },
  permissionActions: {
    gap: spacing.md,
  },
  cameraRoot: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  hudOverlay: {
    flex: 1,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.8,
  },
  topBarTitle: {
    ...typography.headlineSm,
    color: colors.white,
  },
  topBarSpacer: {
    width: 40,
    height: 40,
  },
  viewfinderSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  documentFrame: {
    width: "100%",
    maxWidth: DOCUMENT_FRAME_MAX_WIDTH,
    aspectRatio: DOCUMENT_FRAME_ASPECT_RATIO,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    backgroundColor: "rgba(15, 23, 42, 0.12)",
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: colors.primary,
  },
  cornerTopLeft: {
    top: -1,
    left: -1,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: radius.md,
  },
  cornerTopRight: {
    top: -1,
    right: -1,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: radius.md,
  },
  cornerBottomLeft: {
    bottom: -1,
    left: -1,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: radius.md,
  },
  cornerBottomRight: {
    bottom: -1,
    right: -1,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: radius.md,
  },
  guidanceBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
  },
  guidanceText: {
    ...typography.bodySm,
    color: colors.white,
  },
  shutterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  shutterSide: {
    flex: 1,
    alignItems: "center",
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    borderWidth: 4,
    borderColor: colors.white,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  shutterPressed: {
    transform: [{ scale: 0.95 }],
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  previewSafeArea: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  previewImageContainer: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  previewFrame: {
    width: "100%",
    maxWidth: DOCUMENT_FRAME_MAX_WIDTH,
    aspectRatio: DOCUMENT_FRAME_ASPECT_RATIO,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.navy,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewFooter: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    boxShadow: "0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.06)",
  },
  previewHint: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: "center",
  },
  previewActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  actionItem: {
    flex: 1,
  },
});
