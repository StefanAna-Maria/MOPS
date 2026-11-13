import { useState } from "react";
import { Pressable, StyleSheet, type TextInputProps } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { TextField } from "@/components/text-field";
import { colors, spacing } from "@/constants/theme";

type PasswordFieldProps = Omit<TextInputProps, "secureTextEntry"> & {
  label: string;
};

export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Ascunde parola" : "Arată parola"}
          hitSlop={8}
          onPress={() => setVisible((value) => !value)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        >
          <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textSecondary} />
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  toggle: {
    height: "100%",
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
});
