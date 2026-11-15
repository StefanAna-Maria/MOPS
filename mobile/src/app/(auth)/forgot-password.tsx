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

export default function ForgotPasswordScreen() {
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
          Alert.alert("Nu am putut trimite codul", "Încearcă din nou.");
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
    <Screen title="Ai uitat parola?" subtitle="Scrie emailul contului și îți trimitem un cod de 6 cifre.">
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
        <PrimaryButton title="Trimite codul" onPress={handleSend} disabled={!isValidEmail(email)} loading={loading} />
      </Card>
      <TextLink href="/sign-in">Înapoi la „Intră în cont”</TextLink>
    </Screen>
  );
}
