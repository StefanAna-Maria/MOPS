import { StyleSheet, Text } from "react-native";
import { Screen } from "@/components/screen";
import { TextLink } from "@/components/text-link";
import { colors, typography } from "@/constants/theme";

export default function ForgotPasswordScreen() {
  return (
    <Screen title="Ai uitat parola?">
      <Text style={styles.placeholder}>Ecran în lucru (CA-02).</Text>
      <TextLink href="/sign-in">Înapoi la „Intră în cont”</TextLink>
    </Screen>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
});
