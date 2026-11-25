import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { TextField } from "@/components/text-field";
import { PasswordField } from "@/components/password-field";
import { TextLink } from "@/components/text-link";
import { PrimaryButton } from "@/components/primary-button";
import { authClient } from "@/lib/auth-client";
import { isValidEmail } from "@/lib/validation";
import { showServerUnavailable, showTooManyAttempts } from "@/lib/alerts";
import { useT } from "@/i18n";

export default function SignInScreen() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = isValidEmail(email) && password.length > 0;

  async function handleSignIn() {
    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({
        email: normalizedEmail,
        password,
      });
      if (!error) {
        return;
      }
      if (error.status === 429) {
        showTooManyAttempts();
      } else if (error.code === "EMAIL_NOT_VERIFIED") {
        router.push({ pathname: "/verify-email", params: { email: normalizedEmail } });
      } else if (error.status === 401) {
        Alert.alert(t.signIn.failedTitle, t.signIn.wrongCredentials);
      } else {
        Alert.alert(t.signIn.failedTitle, t.common.tryAgain);
      }
    } catch {
      showServerUnavailable();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title={t.signIn.title} subtitle={t.signIn.subtitle}>
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
          autoComplete="current-password"
          textContentType="password"
        />
        <TextLink href="/forgot-password" align="right">
          {t.signIn.forgotPassword}
        </TextLink>
        <PrimaryButton title={t.signIn.submit} onPress={handleSignIn} disabled={!canSubmit} loading={loading} />
      </Card>
      <TextLink href="/sign-up">{t.signIn.noAccount}</TextLink>
    </Screen>
  );
}
