import { StyleSheet, Text, View } from "react-native";
import { passwordRules } from "@ocrinvoice/shared";
import { colors, radius, spacing, typography } from "@/constants/theme";

export function PasswordChecklist({ password }: { password: string }) {
  return (
    <View style={styles.container}>
      {passwordRules.map((rule) => {
        const passed = rule.test(password);
        return (
          <View key={rule.id} style={styles.row}>
            <View style={[styles.indicator, passed && styles.indicatorPassed]}>
              {passed ? <Text style={styles.check}>✓</Text> : null}
            </View>
            <Text style={[styles.rule, passed && styles.rulePassed]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  indicator: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorPassed: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  check: {
    color: colors.white,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  rule: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  rulePassed: {
    color: colors.successText,
  },
});
