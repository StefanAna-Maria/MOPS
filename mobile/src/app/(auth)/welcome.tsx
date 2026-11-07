import { useState, type ComponentProps } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { PrimaryButton } from "@/components/primary-button";
import { colors, radius, spacing, typography } from "@/constants/theme";

type Slide = {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  description: string;
};

const slides: Slide[] = [
  {
    icon: "scan-outline",
    title: "Scanează bonuri și facturi",
    description: "Fotografiezi documentul, iar aplicația citește automat magazinul, data și totalul.",
  },
  {
    icon: "create-outline",
    title: "Verifici și corectezi",
    description: "Poți modifica oricând datele citite sau poți adăuga manual o cheltuială.",
  },
  {
    icon: "stats-chart-outline",
    title: "Vezi unde se duc banii",
    description: "Statistici clare, ca să înțelegi cum cheltuiești în fiecare lună.",
  },
  {
    icon: "briefcase-outline",
    title: "Personal sau pentru firmă",
    description: "Ții separat cheltuielile personale de cele ale firmei, în același cont.",
  },
];

export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Image source={require("@/assets/images/logo-mark.png")} style={styles.logo} />
        <Text style={styles.brand}>OCRInvoice</Text>
      </View>

      <FlatList
        data={slides}
        keyExtractor={(slide) => slide.title}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon} size={56} color={colors.primary} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {slides.map((slide, index) => (
          <View key={slide.title} style={[styles.dot, index === activeIndex && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.actions}>
        <PrimaryButton title="Creează cont" onPress={() => router.push("/sign-up")} />
        <PrimaryButton title="Am deja cont" variant="outline" onPress={() => router.push("/sign-in")} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brand: {
    ...typography.headlineMd,
    color: colors.textPrimary,
  },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.headlineXl,
    color: colors.textPrimary,
    textAlign: "center",
  },
  description: {
    ...typography.bodyLg,
    color: colors.textSecondary,
    textAlign: "center",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.borderStrong,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
});
