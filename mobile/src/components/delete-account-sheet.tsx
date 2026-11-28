import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheet } from "@/components/bottom-sheet";
import { PrimaryButton } from "@/components/primary-button";
import { useT } from "@/i18n";
import { colors, radius, spacing, typography } from "@/constants/theme";

type DeleteAccountSheetProps = {
  visible: boolean;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** US-12 (CA-12.1): asks before the account and all its data are deleted for good. */
export function DeleteAccountSheet({ visible, deleting, onConfirm, onCancel }: DeleteAccountSheetProps) {
  const t = useT();

  return (
    <BottomSheet visible={visible} title={t.deleteAccount.confirmTitle} onClose={deleting ? () => {} : onCancel}>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Ionicons name="trash-outline" size={28} color={colors.error} />
        </View>
        <Text style={styles.text}>{t.deleteAccount.confirmText}</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton title={t.deleteAccount.confirm} variant="danger" onPress={onConfirm} loading={deleting} />
        <PrimaryButton title={t.common.cancel} variant="outline" onPress={onCancel} disabled={deleting} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    ...typography.bodyMd,
    textAlign: "center",
    color: colors.textBody,
  },
  actions: {
    gap: spacing.md,
  },
});
