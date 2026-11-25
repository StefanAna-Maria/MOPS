import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheet } from "@/components/bottom-sheet";
import { PrimaryButton } from "@/components/primary-button";
import { colors, radius, spacing, typography } from "@/constants/theme";
import { formatDate, useLanguage, useT } from "@/i18n";

type DateTimeFieldProps = {
  label: string;
  mode: "date" | "time";
  /** "12.11.2026" for a date, "17:58" for a time, or "" when not set. */
  value: string;
  onChange: (value: string) => void;
  /** The latest moment that can be picked (no date or time in the future). */
  maximumDate?: Date;
  placeholder: string;
  error?: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function formatPickedDate(date: Date) {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function formatPickedTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toPickerDate(mode: "date" | "time", value: string, fallback: Date) {
  if (mode === "date") {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
    return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : fallback;
  }
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return fallback;
  }
  const date = new Date(fallback);
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

export function DateTimeField({ label, mode, value, onChange, maximumDate, placeholder, error }: DateTimeFieldProps) {
  const t = useT();
  const { language } = useLanguage();
  // CA-17.3: the value is kept as "12.11.2026" and shown in the current language ("11/12/2026" in English).
  const dateMatch = mode === "date" ? /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value) : null;
  const shown = dateMatch ? formatDate(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`, language) : value;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => new Date());
  const format = mode === "date" ? formatPickedDate : formatPickedTime;
  const display = mode === "date" ? (Platform.OS === "ios" ? "inline" : "calendar") : "spinner";

  function openPicker() {
    const fallback = maximumDate ?? new Date();
    const current = toPickerDate(mode, value, fallback);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode,
        display: mode === "date" ? "calendar" : "spinner",
        is24Hour: true,
        maximumDate: mode === "date" ? maximumDate : undefined,
        onChange: (event: DateTimePickerEvent, picked?: Date) => {
          if (event.type === "set" && picked) {
            onChange(format(picked));
          }
        },
      });
      return;
    }
    setDraft(current);
    setOpen(true);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown || placeholder}`}
        accessibilityHint={error ?? undefined}
        onPress={openPicker}
        style={({ pressed }) => [styles.box, !!error && styles.boxError, pressed && styles.pressed]}
      >
        <Text style={[styles.value, !value && styles.placeholder]}>{shown || placeholder}</Text>
        <Ionicons name={mode === "date" ? "calendar-outline" : "time-outline"} size={20} color={colors.textSecondary} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <BottomSheet visible={open} title={label} onClose={() => setOpen(false)}>
        <DateTimePicker
          value={draft}
          mode={mode}
          display={display}
          maximumDate={maximumDate}
          locale={language === "en" ? "en-US" : "ro-RO"}
          accentColor={colors.primary}
          themeVariant="light"
          onChange={(_event: DateTimePickerEvent, picked?: Date) => {
            if (picked) {
              setDraft(picked);
            }
          }}
        />
        <PrimaryButton
          title={t.common.done}
          onPress={() => {
            onChange(format(draft));
            setOpen(false);
          }}
        />
      </BottomSheet>
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
    justifyContent: "space-between",
    height: 48,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
  },
  boxError: {
    borderColor: colors.error,
  },
  pressed: {
    opacity: 0.7,
  },
  value: {
    ...typography.bodyLg,
    color: colors.textPrimary,
  },
  placeholder: {
    color: colors.textSecondary,
  },
  error: {
    ...typography.bodySm,
    color: colors.error,
  },
});
