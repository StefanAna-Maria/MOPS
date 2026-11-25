import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { TextField } from "@/components/text-field";
import { TextLink } from "@/components/text-link";
import { PrimaryButton } from "@/components/primary-button";
import { authClient } from "@/lib/auth-client";
import { isValidEmail } from "@/lib/validation";
import { showServerUnavailable, showTooManyAttempts } from "@/lib/alerts";
import { useT } from "@/i18n";

export default function ForgotPasswordScreen() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);
    try {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email: normalizedEmail });
      if (error) {
        if (error.status === 429) {
          showTooManyAttempts();
        } else {
          Alert.alert(t.code.sendFailedTitle, t.common.tryAgain);
        }
        return;
      }
      // Same next step whether or not the address has an account (CA-02.13).
      router.push({ pathname: "/reset-password", params: { email: normalizedEmail } });
    } catch {
      showServerUnavailable();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title={t.forgotPassword.title} subtitle={t.forgotPassword.subtitle}>
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
        <PrimaryButton title={t.forgotPassword.send} onPress={handleSend} disabled={!isValidEmail(email)} loading={loading} />
      </Card>
      <TextLink href="/sign-in">{t.signIn.backToSignIn}</TextLink>
    </Screen>
  );
}
