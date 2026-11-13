import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { CODE_LENGTH, CodeInput } from "@/components/code-input";
import { PrimaryButton } from "@/components/primary-button";
import { TextLink } from "@/components/text-link";
import { authClient } from "@/lib/auth-client";
import { showServerUnavailable, showTooManyAttempts } from "@/lib/alerts";
import { colors, typography } from "@/constants/theme";

const RESEND_COOLDOWN_SECONDS = 30;

function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? "";

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function handleVerify() {
    setLoading(true);
    try {
      const { error } = await authClient.emailOtp.verifyEmail({ email, otp: code });
      if (!error) {
        // The session is created by the server: the root layout moves us into the app.
        return;
      }
      setCode("");
      if (error.status === 429) {
        showTooManyAttempts();
      } else if (error.code === "OTP_EXPIRED") {
        Alert.alert("Codul a expirat", "Cere un cod nou și încearcă din nou.");
      } else if (error.code === "TOO_MANY_ATTEMPTS") {
        Alert.alert("Prea multe încercări", "Cere un cod nou și încearcă din nou.");
      } else if (error.code === "INVALID_OTP") {
        Alert.alert("Cod greșit", "Codul nu se potrivește. Verifică emailul și scrie-l din nou.");
      } else {
        Alert.alert("Nu am putut confirma adresa", "Încearcă din nou.");
      }
    } catch {
      showServerUnavailable();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
      if (error) {
        if (error.status === 429) {
          showTooManyAttempts();
        } else {
          Alert.alert("Nu am putut trimite codul", "Încearcă din nou.");
        }
        return;
      }
      setCode("");
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    } catch {
      showServerUnavailable();
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen title="Verifică-ți emailul" subtitle={`Am trimis un cod de ${CODE_LENGTH} cifre la ${email}.`}>
      <Card>
        <CodeInput value={code} onChangeText={setCode} editable={!loading} />
        <PrimaryButton
          title="Confirmă"
          onPress={handleVerify}
          disabled={code.length !== CODE_LENGTH}
          loading={loading}
        />
        {secondsLeft > 0 ? (
          <Text style={styles.countdown}>Poți cere un cod nou în {formatCountdown(secondsLeft)}</Text>
        ) : (
          <Pressable accessibilityRole="button" onPress={handleResend} disabled={resending}>
            <Text style={styles.resend}>Trimite un cod nou</Text>
          </Pressable>
        )}
      </Card>
      <TextLink href="/sign-in">Înapoi la „Intră în cont”</TextLink>
    </Screen>
  );
}

const styles = StyleSheet.create({
  countdown: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: "center",
  },
  resend: {
    ...typography.label,
    color: colors.primary,
    textAlign: "center",
  },
});
