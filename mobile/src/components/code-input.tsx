import type React from "react";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing, typography } from "@/constants/theme";

export const CODE_LENGTH = 6;

type CodeInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
};

// One real (invisible) input drives six boxes, so pasting and the SMS/email autofill keep working.
export function CodeInput({ value, onChangeText, editable = true }: CodeInputProps) {
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.row}>
      {Array.from({ length: CODE_LENGTH }, (_, index) => {
        const active = focused && index === Math.min(value.length, CODE_LENGTH - 1);
        return (
          <View key={index} style={[styles.box, active && styles.boxActive]}>
            <Text style={styles.digit}>{value[index] ?? ""}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        accessibilityLabel="Cod de confirmare"
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        editable={editable}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        autoFocus
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  box: {
    flex: 1,
    height: 56,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxActive: {
    borderColor: colors.primary,
  },
  digit: {
    ...typography.headlineLg,
    color: colors.textPrimary,
  },
  hiddenInput: {
    ...StyleSheet.absoluteFill as object,
    opacity: 0,
  },
});
