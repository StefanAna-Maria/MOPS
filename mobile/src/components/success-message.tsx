import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Card } from "@/components/card";
import { PrimaryButton } from "@/components/primary-button";
import { colors, radius, spacing, typography } from "@/constants/theme";

type SuccessMessageProps = {
  title: string;
  message: string;
  buttonTitle: string;
  onPress: () => void;
};

export function SuccessMessage({ title, message, buttonTitle, onPress }: SuccessMessageProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.center}>
        <Card>
          <View style={styles.content}>
            <View style={styles.circle}>
              <Ionicons name="checkmark" size={44} color={colors.success} />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
          </View>
          <PrimaryButton title={buttonTitle} onPress={onPress} />
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  content: {
    alignItems: "center",
    gap: spacing.lg,
    paddingVertical: spacing.xl,
  },
  circle: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...typography.headlineLg,
    color: colors.textPrimary,
    textAlign: "center",
  },
  message: {
    ...typography.bodyMd,
    color: colors.textBody,
    textAlign: "center",
  },
});
