import { useState, type ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, radius, spacing, typography } from "@/constants/theme";

type TextFieldProps = TextInputProps & {
  label: string;
  accessory?: ReactNode;
  error?: string | null;
};

export function TextField({ label, accessory, error, style, onFocus, onBlur, multiline, ...props }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.box,
          multiline && styles.boxMultiline,
          focused && styles.boxFocused,
          !!error && styles.boxError,
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? undefined}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          placeholderTextColor={colors.textSecondary}
          selectionColor={colors.primary}
          multiline={multiline}
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  boxMultiline: {
    height: undefined,
    minHeight: 96,
    alignItems: "flex-start",
  },
  boxFocused: {
    borderColor: colors.primary,
  },
  boxError: {
    borderColor: colors.error,
  },
  input: {
    ...typography.bodyLg,
    flex: 1,
    height: "100%",
    paddingHorizontal: spacing.lg,
    color: colors.textPrimary,
  },
  inputMultiline: {
    height: undefined,
    minHeight: 96,
    paddingVertical: spacing.md,
    textAlignVertical: "top",
  },
  error: {
    ...typography.bodySm,
    color: colors.error,
  },
});
