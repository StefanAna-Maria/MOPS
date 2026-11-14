import { useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { PasswordField } from "@/components/password-field";
import { PasswordChecklist } from "@/components/password-checklist";
import { PrimaryButton } from "@/components/primary-button";
import { SuccessMessage } from "@/components/success-message";
import { TextLink } from "@/components/text-link";
import { authClient } from "@/lib/auth-client";
import { showServerUnavailable, showTooManyAttempts } from "@/lib/alerts";
import { isStrongPassword } from "@ocrinvoice/shared";
import { colors, typography } from "@/constants/theme";

export default function ChangePasswordScreen() {
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
          Alert.alert("Parola curentă este greșită", "Verifică parola curentă și încearcă din nou.");
        } else if (error.code === "PASSWORD_SAME_AS_CURRENT") {
          Alert.alert("Parola coincide cu cea curentă!", "Alege o parolă diferită de cea curentă.");
        } else if (error.code === "PASSWORD_TOO_WEAK") {
          Alert.alert("Parolă prea slabă", "Parola nouă trebuie să respecte toate cele trei reguli.");
        } else {
          Alert.alert("Nu am putut schimba parola", "Încearcă din nou.");
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
        title="Parola a fost schimbată cu succes!"
        message="Celelalte dispozitive au fost deconectate."
        buttonTitle="Revino în aplicație"
        onPress={() => router.back()}
      />
    );
  }

  return (
    <Screen title="Schimbă parola" subtitle="Celelalte dispozitive vor fi deconectate.">
      <Card>
        <PasswordField
          label="Parola curentă"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          autoComplete="current-password"
          textContentType="password"
        />
        <PasswordField
          label="Parola nouă"
          value={newPassword}
          onChangeText={setNewPassword}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {sameAsCurrent ? <Text style={styles.error}>Parola coincide cu cea curentă!</Text> : null}
        <PasswordChecklist password={newPassword} />
        <PasswordField
          label="Confirmare parola nouă"
          value={confirmation}
          onChangeText={setConfirmation}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {mismatch ? <Text style={styles.error}>Parolele nu coincid.</Text> : null}
        <PrimaryButton title="Schimbă parola" onPress={handleChange} disabled={!canSubmit} loading={loading} />
      </Card>
      <TextLink href="/">Renunță</TextLink>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: {
    ...typography.bodyMd,
    color: colors.error,
  },
});
