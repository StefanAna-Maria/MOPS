import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { SheetOption } from "@/components/sheet-option";
import { authClient } from "@/lib/auth-client";
import { useProfile } from "@/lib/profile-context";
import { signOut } from "@/lib/sign-out";
import { colors, radius, typography } from "@/constants/theme";

export function AccountMenu() {
  const { data: session } = authClient.useSession();
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");
  const initials = [profile?.firstName, profile?.lastName]
    .map((part) => part?.trim().charAt(0).toUpperCase() ?? "")
    .join("");

  async function handleSignOut() {
    setOpen(false);
    try {
      await signOut();
    } catch {
      return;
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Contul meu"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
      >
        <Text style={styles.initials}>{initials}</Text>
      </Pressable>
      <BottomSheet visible={open} title="Contul meu" onClose={() => setOpen(false)}>
        <View style={styles.identity}>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.email}>{session?.user.email}</Text>
        </View>
        <SheetOption title="Deconectează-te" tone="danger" onPress={handleSignOut} />
      </BottomSheet>
    </>
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
  identity: {
    gap: 2,
  },
  name: {
    ...typography.headlineSm,
    color: colors.textPrimary,
  },
  email: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
});
