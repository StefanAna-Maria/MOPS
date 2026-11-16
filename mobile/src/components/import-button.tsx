import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, spacing, typography } from "@/constants/theme";

type ImportButtonProps = {
  title: string;
  icon: "images-outline" | "document-outline";
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/** A round icon with its label underneath, for the camera screen ("Din galerie", "Din fișiere"). */
export function ImportButton({ title, icon, onPress, loading, disabled }: ImportButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && !loading && styles.disabled]}
    >
      <View style={styles.circle}>
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Ionicons name={icon} size={24} color={colors.white} />
        )}
      </View>
      <Text style={styles.label}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    gap: spacing.xs,
    minWidth: 88,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.bodySm,
    color: colors.white,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
});
