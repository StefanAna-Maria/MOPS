import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { CODE_LENGTH, CodeInput } from "@/components/code-input";
import { PasswordField } from "@/components/password-field";
import { PasswordChecklist } from "@/components/password-checklist";
import { PrimaryButton } from "@/components/primary-button";
import { TextLink } from "@/components/text-link";
import { authClient } from "@/lib/auth-client";
import { formatCountdown, useResendCountdown } from "@/lib/resend-countdown";
import { showServerUnavailable, showTooManyAttempts } from "@/lib/alerts";
import { isStrongPassword } from "@ocrinvoice/shared";
import { colors, typography } from "@/constants/theme";
import { useT } from "@/i18n";

export default function ResetPasswordScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? "";

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { secondsLeft, restart } = useResendCountdown();

  const canSubmit = code.length === CODE_LENGTH && isStrongPassword(password);

  async function handleReset() {
    setLoading(true);
    try {
      const { error } = await authClient.emailOtp.resetPassword({ email, otp: code, password });
      if (error) {
        if (error.status === 429) {
          showTooManyAttempts();
        } else if (error.code === "PASSWORD_TOO_WEAK") {
          Alert.alert(t.password.tooWeakTitle, t.password.tooWeak);
        } else if (error.code === "OTP_EXPIRED") {
          setCode("");
          Alert.alert(t.code.expiredTitle, t.code.tooManyAttempts);
        } else if (error.code === "TOO_MANY_ATTEMPTS") {
          setCode("");
          Alert.alert(t.common.tooManyAttemptsTitle, t.code.tooManyAttempts);
        } else if (error.code === "INVALID_OTP") {
          setCode("");
          Alert.alert(t.code.wrongTitle, t.code.wrong);
        } else {
          Alert.alert(t.resetPassword.failedTitle, t.common.tryAgain);
        }
        return;
      }
      // Password changed: sign in with it (CA-02.12). The root layout then opens the app.
      const signIn = await authClient.signIn.email({ email, password });
      if (signIn.error) {
        Alert.alert(t.resetPassword.doneTitle, t.resetPassword.done);
        router.replace("/sign-in");
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
      const { error } = await authClient.emailOtp.requestPasswordReset({ email });
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
    <Screen title={t.resetPassword.title} subtitle={t.code.sent(CODE_LENGTH, email)}>
      <Card>
        <CodeInput value={code} onChangeText={setCode} editable={!loading} />
        <PasswordField
          label={t.resetPassword.newPassword}
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <PasswordChecklist password={password} />
        <PrimaryButton title={t.resetPassword.submit} onPress={handleReset} disabled={!canSubmit} loading={loading} />
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
