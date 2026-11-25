import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors } from "@/constants/theme";
import { useT } from "@/i18n";

export function AppLoader() {
  const t = useT();
  return (
    <View style={styles.container} accessibilityLabel={t.common.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
