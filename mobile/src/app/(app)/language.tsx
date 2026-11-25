import { StyleSheet, View } from "react-native";
import { Screen } from "@/components/screen";
import { SheetOption } from "@/components/sheet-option";
import { BackLink } from "@/components/back-link";
import { LANGUAGE_SETTINGS, deviceLanguage, useLanguage, useT, type LanguageSetting } from "@/i18n";
import { spacing } from "@/constants/theme";

/** CA-17.2: Automat, Română or English; the choice applies at once and is kept on the phone. */
export default function LanguageScreen() {
  const t = useT();
  const { setting, setSetting } = useLanguage();

  const title = (option: LanguageSetting) => (option === "auto" ? t.language.auto : t.language.names[option]);
  const subtitle = (option: LanguageSetting) =>
    option === "auto" ? t.language.autoHint(t.language.names[deviceLanguage()]) : undefined;

  return (
    <Screen title={t.language.title} subtitle={t.language.subtitle}>
      <View style={styles.options} accessibilityRole="radiogroup">
        {LANGUAGE_SETTINGS.map((option) => (
          <SheetOption
            key={option}
            title={title(option)}
            subtitle={subtitle(option)}
            selected={setting === option}
            onPress={() => setSetting(option)}
          />
        ))}
      </View>
      <BackLink>{t.common.back}</BackLink>
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: spacing.sm,
  },
});
