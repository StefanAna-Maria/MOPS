import { useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { PasswordField } from "@/components/password-field";
import { PasswordChecklist } from "@/components/password-checklist";
import { PrimaryButton } from "@/components/primary-button";
import { SuccessMessage } from "@/components/success-message";
import { BackLink } from "@/components/back-link";
import { authClient } from "@/lib/auth-client";
import { showServerUnavailable, showTooManyAttempts } from "@/lib/alerts";
import { isStrongPassword } from "@ocrinvoice/shared";
import { colors, typography } from "@/constants/theme";
import { useT } from "@/i18n";

export default function ChangePasswordScreen() {
  const t = useT();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [changed, setChanged] = useState(false);

  const sameAsCurrent = newPassword.length > 0 && newPassword === currentPassword;
  const mismatch = confirmation.length > 0 && confirmation !== newPassword;
  const canSubmit =
    currentPassword.length > 0 && isStrongPassword(newPassword) && !sameAsCurrent && confirmation === newPassword;

  async function handleChange() {
    setLoading(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        if (error.status === 429) {
          showTooManyAttempts();
        } else if (error.code === "INVALID_PASSWORD") {
          Alert.alert(t.changePassword.wrongCurrentTitle, t.changePassword.wrongCurrent);
        } else if (error.code === "PASSWORD_SAME_AS_CURRENT") {
          Alert.alert(t.changePassword.sameAsCurrent, t.changePassword.sameAsCurrentHint);
        } else if (error.code === "PASSWORD_TOO_WEAK") {
          Alert.alert(t.password.tooWeakTitle, t.password.newTooWeak);
        } else {
          Alert.alert(t.changePassword.failedTitle, t.common.tryAgain);
        }
        return;
      }
      setChanged(true);
    } catch {
      showServerUnavailable();
    } finally {
      setLoading(false);
    }
  }

  if (changed) {
    return (
      <SuccessMessage
        title={t.changePassword.doneTitle}
        message={t.changePassword.done}
        buttonTitle={t.changePassword.backToApp}
        onPress={() => router.back()}
      />
    );
  }

  return (
    <Screen title={t.changePassword.title} subtitle={t.changePassword.subtitle}>
      <Card>
        <PasswordField
          label={t.changePassword.current}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          autoComplete="current-password"
          textContentType="password"
        />
        <PasswordField
          label={t.changePassword.next}
          value={newPassword}
          onChangeText={setNewPassword}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {sameAsCurrent ? <Text style={styles.error}>{t.changePassword.sameAsCurrent}</Text> : null}
        <PasswordChecklist password={newPassword} />
        <PasswordField
          label={t.changePassword.confirm}
          value={confirmation}
          onChangeText={setConfirmation}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {mismatch ? <Text style={styles.error}>{t.changePassword.mismatch}</Text> : null}
        <PrimaryButton title={t.changePassword.title} onPress={handleChange} disabled={!canSubmit} loading={loading} />
      </Card>
      <BackLink>{t.common.cancel}</BackLink>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: {
    ...typography.bodyMd,
    color: colors.error,
  },
});
