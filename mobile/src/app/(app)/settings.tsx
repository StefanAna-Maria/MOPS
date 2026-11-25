import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { Screen } from "@/components/screen";
import { PrimaryButton } from "@/components/primary-button";
import { SettingsRow, SettingsSection } from "@/components/settings-row";
import { BackLink } from "@/components/back-link";
import { initialsOf } from "@/components/account-menu";
import { authClient } from "@/lib/auth-client";
import { useProfile } from "@/lib/profile-context";
import { signOut } from "@/lib/sign-out";
import { useLanguage, useT } from "@/i18n";
import { colors, radius, spacing, typography } from "@/constants/theme";

/**
 * "Contul meu", opened from the circle with the initials on Acasă: who is signed in, the account (password, company),
 * the preferences (US-17: language), the app's details and signing out.
 */
export default function SettingsScreen() {
  const t = useT();
  const { language, setting } = useLanguage();
  const { data: session } = authClient.useSession();
  const { profile, company } = useProfile();

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");
  const languageValue =
    setting === "auto" ? `${t.language.auto} (${t.language.names[language]})` : t.language.names[setting];

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      return;
    }
  }

  return (
    <Screen title={t.account.title}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{initialsOf(profile?.firstName, profile?.lastName)}</Text>
        </View>
        <View style={styles.identity}>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.email}>{session?.user.email}</Text>
        </View>
      </View>

      <SettingsSection title={t.settings.account}>
        <SettingsRow
          icon="key-outline"
          label={t.settings.changePassword}
          onPress={() => router.push("/change-password")}
        />
        {company ? (
          <SettingsRow icon="briefcase-outline" label={t.settings.company} value={company.name} last />
        ) : (
          <SettingsRow
            icon="briefcase-outline"
            label={t.settings.addCompany}
            onPress={() => router.push("/add-company")}
            last
          />
        )}
      </SettingsSection>

      <SettingsSection title={t.settings.preferences}>
        <SettingsRow
          icon="language-outline"
          label={t.settings.language}
          value={languageValue}
          onPress={() => router.push("/language")}
          last
        />
      </SettingsSection>

      <SettingsSection title={t.settings.about}>
        <SettingsRow
          icon="information-circle-outline"
          label={t.settings.version}
          value={Constants.expoConfig?.version ?? "—"}
          last
        />
      </SettingsSection>

      <View style={styles.signOut}>
        <PrimaryButton title={t.settings.signOut} variant="dangerOutline" onPress={handleSignOut} />
      </View>
      <BackLink>{t.common.back}</BackLink>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    ...typography.headlineMd,
    color: colors.white,
  },
  identity: {
    flex: 1,
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
  signOut: {
    marginTop: spacing.sm,
  },
});
