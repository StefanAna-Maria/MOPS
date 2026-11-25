import { Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { useProfile } from "@/lib/profile-context";
import { useT } from "@/i18n";
import { colors, radius, typography } from "@/constants/theme";

export function initialsOf(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].map((part) => part?.trim().charAt(0).toUpperCase() ?? "").join("");
}

/** The circle with the user's initials on Acasă; it opens "Contul meu" (account, preferences, sign out). */
export function AccountMenu() {
  const t = useT();
  const { profile } = useProfile();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.account.title}
      onPress={() => router.push("/settings")}
      style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
    >
      <Text style={styles.initials}>{initialsOf(profile?.firstName, profile?.lastName)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.85,
  },
  initials: {
    ...typography.label,
    color: colors.white,
  },
});
