import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ContextSwitcher } from "@/components/context-switcher";
import { AccountMenu } from "@/components/account-menu";
import { getGreeting } from "@/lib/greeting";
import { useProfile } from "@/lib/profile-context";
import { colors, spacing, typography } from "@/constants/theme";

export default function HomeScreen() {
  const { profile } = useProfile();

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  greeting: {
    ...typography.headlineXl,
    color: colors.textPrimary,
  },
});
