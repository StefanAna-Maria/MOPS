import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { BottomSheet } from "@/components/bottom-sheet";
import { SheetOption } from "@/components/sheet-option";
import { apiFetch } from "@/lib/api";
import { useProfile, type ActiveContext } from "@/lib/profile-context";
import { showServerUnavailable } from "@/lib/alerts";
import { colors, radius, spacing, typography } from "@/constants/theme";

export function ContextSwitcher() {
  const { profile, company, activeContext, setActiveContext, setProfile } = useProfile();
  const [open, setOpen] = useState(false);

  const personalEnabled = profile?.personalEnabled ?? false;
  const activeLabel = activeContext === "company" && company ? company.name : "Personal";

  function select(context: ActiveContext) {
    setActiveContext(context);
    setOpen(false);
  }

  function handleAddCompany() {
    setOpen(false);
    router.push("/add-company");
  }

  async function handleEnablePersonal() {
    try {
      const response = await apiFetch("/api/me/personal", { method: "POST" });
      if (!response.ok) {
        Alert.alert("Nu am putut activa profilul personal", "Încearcă din nou.");
        return;
      }
      const data = await response.json();
      setProfile(data.profile);
      select("personal");
    } catch {
      showServerUnavailable();
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Profil activ: ${activeLabel}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {activeLabel}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <BottomSheet visible={open} title="Alege profilul" onClose={() => setOpen(false)}>
        {personalEnabled ? (
          <SheetOption title="Personal" selected={activeContext === "personal"} onPress={() => select("personal")} />
        ) : null}
        {company ? (
          <SheetOption
            title={company.name}
            subtitle={`CUI ${company.cui}`}
            selected={activeContext === "company"}
            onPress={() => select("company")}
          />
        ) : null}
        {!company ? <SheetOption title="+ Adaugă firma" tone="action" onPress={handleAddCompany} /> : null}
        {!personalEnabled ? (
          <SheetOption title="+ Activează profilul personal" tone="action" onPress={handleEnablePersonal} />
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    maxWidth: 140,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.85,
  },
  triggerText: {
    ...typography.label,
    flexShrink: 1,
    color: colors.textPrimary,
  },
  chevron: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
});
