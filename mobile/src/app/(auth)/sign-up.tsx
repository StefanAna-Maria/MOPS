import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { TextField } from "@/components/text-field";
import { PasswordField } from "@/components/password-field";
import { TextLink } from "@/components/text-link";
import { PrimaryButton } from "@/components/primary-button";
import { PasswordChecklist } from "@/components/password-checklist";
import { authClient } from "@/lib/auth-client";
import { isStrongPassword, type UsageType } from "@ocrinvoice/shared";
import { isValidEmail } from "@/lib/validation";
import { showServerUnavailable, showTooManyAttempts } from "@/lib/alerts";
import { colors, radius, spacing, typography } from "@/constants/theme";
import { useT } from "@/i18n";


export default function SignUpScreen() {
  const t = useT();
  const usageOptions: { value: UsageType; label: string }[] = [
    { value: "PERSONAL", label: t.signUp.usagePersonal },
    { value: "COMPANY", label: t.signUp.usageCompany },
  ];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usageType, setUsageType] = useState<UsageType>("PERSONAL");
  const [loading, setLoading] = useState(false);

  const canSubmit = isValidEmail(email) && isStrongPassword(password);

  async function handleSignUp() {
    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);
    try {
      const { error } = await authClient.signUp.email({
        email: normalizedEmail,
        password,
        name: "",
        usageType,
      });
      if (error) {
        if (error.status === 429) {
          showTooManyAttempts();
        } else if (error.code === "PASSWORD_TOO_WEAK") {
          Alert.alert(t.password.tooWeakTitle, t.password.tooWeak);
        } else {
          Alert.alert(t.signUp.failedTitle, t.common.tryAgain);
        }
        return;
      }
      router.push({ pathname: "/verify-email", params: { email: normalizedEmail } });
    } catch {
      showServerUnavailable();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title={t.signUp.title} subtitle={t.signUp.subtitle}>
      <Card>
        <TextField
          label={t.common.email}
          value={email}
          onChangeText={setEmail}
          placeholder={t.common.emailPlaceholder}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <PasswordField
          label={t.common.password}
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <PasswordChecklist password={password} />
        <View style={styles.usage}>
          <Text style={styles.usageLabel}>{t.signUp.usageLabel}</Text>
          <View style={styles.usageOptions}>
            {usageOptions.map((option) => {
              const selected = usageType === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setUsageType(option.value)}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <PrimaryButton title={t.signUp.submit} onPress={handleSignUp} disabled={!canSubmit} loading={loading} />
      </Card>
      <TextLink href="/sign-in">{t.signUp.haveAccount}</TextLink>
    </Screen>
  );
}

const styles = StyleSheet.create({
  usage: {
    gap: spacing.sm,
  },
  usageLabel: {
    ...typography.label,
    color: colors.textBody,
  },
  usageOptions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  option: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.base,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  optionText: {
    ...typography.bodyLg,
    color: colors.textBody,
  },
  optionTextSelected: {
    fontFamily: typography.label.fontFamily,
    color: colors.primary,
  },
});
