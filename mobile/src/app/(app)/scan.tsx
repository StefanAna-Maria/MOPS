import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useIsFocused } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppLoader } from "@/components/app-loader";
import { Card } from "@/components/card";
import { PrimaryButton } from "@/components/primary-button";
import { colors, radius, spacing, typography } from "@/constants/theme";

const CORNER_SIZE = 28;
const CORNER_THICKNESS = 4;

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState !== "background");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(nextState === "active");
    });
    return () => {
      subscription.remove();
    };
  }, []);

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
                  ? "Ai refuzat accesul la cameră. Pentru a fotografia un bon și a nu-l mai păstra pe hârtie, activează permisiunea din setările telefonului."
                  : "Avem nevoie de acces la cameră pentru a fotografia bonurile și facturile tale, ca să nu le mai păstrezi pe hârtie."}
              </Text>
            </View>
            <View style={styles.permissionActions}>
              {isPermanentlyDenied ? (
                <PrimaryButton
                  title="Deschide setările"
                  onPress={() => {
                    void Linking.openSettings();
                  }}
                />
              ) : (
                <PrimaryButton
                  title="Permite accesul"
                  onPress={() => {
                    void requestPermission();
                  }}
                />
              )}
              <PrimaryButton title="Înapoi" variant="outline" onPress={() => router.back()} />
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
        setPhotoUri(photo.uri);
      }
    } catch {
      Alert.alert("Nu am putut realiza fotografia", "Încearcă din nou.");
    } finally {
      setIsTakingPicture(false);
    }
  }

  function handleRetake() {
    setPhotoUri(null);
  }

  function handleContinue() {
    router.back();
  }

  if (photoUri) {
    return (
      <SafeAreaView style={styles.previewSafeArea} edges={["top", "left", "right"]}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Închide camera"
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
          <Image
            source={{ uri: photoUri }}
            style={styles.previewImage}
            resizeMode="contain"
            accessibilityLabel="Poza documentului"
            testID="captured-photo"
          />
        </View>

        <SafeAreaView edges={["bottom"]} style={styles.previewFooter}>
          <Text style={styles.previewHint}>
            Verifică dacă textul, data și totalul de pe bon sunt lizibile.
          </Text>
          <View style={styles.previewActions}>
            <View style={styles.actionItem}>
              <PrimaryButton title="Refă poza" variant="outline" onPress={handleRetake} />
            </View>
            <View style={styles.actionItem}>
              <PrimaryButton title="Continuă" onPress={handleContinue} />
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaView>
    );
  }

  const isCameraActive = isFocused && isAppActive;

  return (
    <View style={styles.cameraRoot}>
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

      <SafeAreaView style={styles.hudOverlay} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Închide camera"
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

        <View style={styles.viewfinderSection}>
          <View
            style={styles.documentFrame}
            accessibilityLabel="Chenarul documentului"
            testID="document-frame"
          >
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
          <View style={styles.guidanceBadge}>
            <Text style={styles.guidanceText}>Încadrează bonul în chenar</Text>
          </View>
        </View>

        <View style={styles.shutterBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Declanșator"
            accessibilityState={{ disabled: isTakingPicture }}
            disabled={isTakingPicture}
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
    maxWidth: 320,
    aspectRatio: 0.68,
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
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    borderRadius: radius.base,
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

