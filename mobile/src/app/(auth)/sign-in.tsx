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

export default function SignInScreen() {
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
        Alert.alert("Nu am putut intra", "Emailul sau parola nu se potrivesc. Verifică-le și încearcă din nou.");
      } else {
        Alert.alert("Nu am putut intra", "Încearcă din nou.");
      }
    } catch {
      showServerUnavailable();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Intră în cont" subtitle="Bine ai revenit! Introdu datele contului tău.">
      <Card>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="nume@exemplu.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <PasswordField
          label="Parolă"
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
        />
        <TextLink href="/forgot-password" align="right">
          Ai uitat parola?
        </TextLink>
        <PrimaryButton title="Intră în cont" onPress={handleSignIn} disabled={!canSubmit} loading={loading} />
      </Card>
      <TextLink href="/sign-up">Nu ai cont? Creează unul</TextLink>
    </Screen>
  );
}
