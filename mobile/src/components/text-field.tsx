import { useState, type ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, radius, spacing, typography } from "@/constants/theme";

type TextFieldProps = TextInputProps & {
  label: string;
  accessory?: ReactNode;
};

export function TextField({ label, accessory, style, onFocus, onBlur, ...props }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, focused && styles.boxFocused]}>
        <TextInput
          accessibilityLabel={label}
          style={[styles.input, style]}
          placeholderTextColor={colors.textSecondary}
          selectionColor={colors.primary}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...props}
        />
        {accessory}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
    color: colors.textBody,
  },
  box: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
  },
  boxFocused: {
    borderColor: colors.primary,
  },
  input: {
    ...typography.bodyLg,
    flex: 1,
    height: "100%",
    paddingHorizontal: spacing.lg,
    color: colors.textPrimary,
  },
});
