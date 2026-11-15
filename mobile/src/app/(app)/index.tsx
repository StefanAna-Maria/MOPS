import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ContextSwitcher } from "@/components/context-switcher";
import { AccountMenu } from "@/components/account-menu";
import { getGreeting } from "@/lib/greeting";
import { useProfile } from "@/lib/profile-context";
import { colors, radius, spacing, typography } from "@/constants/theme";

export default function HomeScreen() {
  const { profile } = useProfile();

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.side}>
          <ContextSwitcher />
        </View>
        <Text style={styles.brand} accessibilityRole="header">
          OCRInvoice
        </Text>
        <View style={[styles.side, styles.sideRight]}>
          <AccountMenu />
        </View>
      </View>
      <View style={styles.content}>
        <Text style={styles.greeting}>
          {getGreeting()}, {profile?.firstName}
        </Text>
      </View>
      <View style={styles.fabContainer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fotografiază un bon"
          onPress={() => router.push("/scan")}
          style={({ pressed }) => [styles.scanFab, pressed && styles.scanFabPressed]}
        >
          <Ionicons name="camera-outline" size={26} color={colors.white} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  side: {
    flex: 1,
    alignItems: "flex-start",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  brand: {
    ...typography.headlineSm,
    color: colors.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  greeting: {
    ...typography.headlineXl,
    color: colors.textPrimary,
  },
  fabContainer: {
    alignItems: "center",
    paddingBottom: spacing.lg,
  },
  scanFab: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 15px -3px rgba(13, 148, 136, 0.35)",
  },
  scanFabPressed: {
    backgroundColor: colors.primaryActive,
  },
});
