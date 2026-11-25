import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { CODE_LENGTH, CodeInput } from "@/components/code-input";
import { PrimaryButton } from "@/components/primary-button";
import { TextLink } from "@/components/text-link";
import { authClient } from "@/lib/auth-client";
import { formatCountdown, useResendCountdown } from "@/lib/resend-countdown";
import { showServerUnavailable, showTooManyAttempts } from "@/lib/alerts";
import { colors, typography } from "@/constants/theme";
import { useT } from "@/i18n";

export default function VerifyEmailScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? "";

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { secondsLeft, restart } = useResendCountdown();

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
        Alert.alert(t.code.expiredTitle, t.code.tooManyAttempts);
      } else if (error.code === "TOO_MANY_ATTEMPTS") {
        Alert.alert(t.common.tooManyAttemptsTitle, t.code.tooManyAttempts);
      } else if (error.code === "INVALID_OTP") {
        Alert.alert(t.code.wrongTitle, t.code.wrong);
      } else {
        Alert.alert(t.verifyEmail.failedTitle, t.common.tryAgain);
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
          Alert.alert(t.code.sendFailedTitle, t.common.tryAgain);
        }
        return;
      }
      setCode("");
      restart();
    } catch {
      showServerUnavailable();
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen title={t.verifyEmail.title} subtitle={t.code.sent(CODE_LENGTH, email)}>
      <Card>
        <CodeInput value={code} onChangeText={setCode} editable={!loading} />
        <PrimaryButton
          title={t.verifyEmail.confirm}
          onPress={handleVerify}
          disabled={code.length !== CODE_LENGTH}
          loading={loading}
        />
        {secondsLeft > 0 ? (
          <Text style={styles.countdown}>{t.code.resendIn(formatCountdown(secondsLeft))}</Text>
        ) : (
          <Pressable accessibilityRole="button" onPress={handleResend} disabled={resending}>
            <Text style={styles.resend}>{t.code.resend}</Text>
          </Pressable>
        )}
      </Card>
      <TextLink href="/sign-in">{t.signIn.backToSignIn}</TextLink>
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
