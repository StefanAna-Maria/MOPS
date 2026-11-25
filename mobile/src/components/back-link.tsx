import { Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { colors, typography } from "@/constants/theme";

/**
 * "Înapoi" / "Renunță" at the bottom of a screen: closes it, exactly like the system back gesture (swipe) or button.
 * A link to the previous screen would open that screen again on top, so a swipe afterwards came back here.
 */
export function BackLink({ children }: { children: string }) {
  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }

  return (
    <Pressable accessibilityRole="link" onPress={goBack} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
      <Text style={styles.link}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    ...typography.label,
    alignSelf: "center",
    color: colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
});
