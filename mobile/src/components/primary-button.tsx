import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, spacing, typography } from "@/constants/theme";

type ButtonVariant = "primary" | "secondary" | "outline";

type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
};

export function PrimaryButton({ title, onPress, disabled, loading, variant = "primary" }: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  const textColor = variant === "outline" ? colors.textPrimary : colors.white;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && variant === "primary" && styles.primaryPressed,
        pressed && variant !== "primary" && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        // Button labels stay on one line. Android's default "highQuality" line breaking can wrap the last word of a
        // short label with a custom font (seen on "Înapoi la Acasă"); "simple" breaking and one line prevent it.
        <Text
          style={[styles.text, { color: textColor }]}
          numberOfLines={1}
          textBreakStrategy="simple"
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: radius.base,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: colors.primary,
  },
  primaryPressed: {
    backgroundColor: colors.primaryActive,
  },
  secondary: {
    backgroundColor: colors.navy,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    ...typography.button,
  },
});
