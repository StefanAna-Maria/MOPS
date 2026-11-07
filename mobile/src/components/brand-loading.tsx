import { useEffect, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors, radius, spacing, typography } from "@/constants/theme";

export function BrandLoading() {
  const [entrance] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const scale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <View style={styles.container} accessibilityLabel="Se încarcă OCRInvoice">
      <StatusBar style="light" />
      <Animated.View style={[styles.brand, { opacity: entrance, transform: [{ scale }] }]}>
        <Image source={require("@/assets/images/logo-mark.png")} style={styles.logo} />
        <Text style={styles.name}>OCRInvoice</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  brand: {
    alignItems: "center",
    gap: spacing.lg,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
  },
  name: {
    ...typography.headlineXl,
    fontSize: 30,
    lineHeight: 38,
    color: colors.white,
  },
});
