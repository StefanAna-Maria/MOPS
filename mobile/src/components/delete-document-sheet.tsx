import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { type ExpenseDocument } from "@ocrinvoice/shared";
import { BottomSheet } from "@/components/bottom-sheet";
import { PrimaryButton } from "@/components/primary-button";
import { amountToCents, formatLei } from "@/lib/expense-list";
import { DOCUMENT_MESSAGES } from "@/lib/expense-messages";
import { colors, radius, spacing, typography } from "@/constants/theme";
import { formatDate, useT } from "@/i18n";

type DeleteDocumentSheetProps = {
  visible: boolean;
  document: ExpenseDocument;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DeleteDocumentSheet({ visible, document, deleting, onConfirm, onCancel }: DeleteDocumentSheetProps) {
  const t = useT();
  const summary = t.document.summary(document.merchant, formatLei(amountToCents(document.total)), formatDate(document.date));

  return (
    <BottomSheet visible={visible} title={DOCUMENT_MESSAGES.confirmTitle} onClose={deleting ? () => {} : onCancel}>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Ionicons name="trash-outline" size={28} color={colors.error} />
        </View>
        <Text style={styles.text}>{DOCUMENT_MESSAGES.confirmText(summary)}</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton title={DOCUMENT_MESSAGES.confirm} variant="danger" onPress={onConfirm} loading={deleting} />
        <PrimaryButton title={DOCUMENT_MESSAGES.cancel} variant="outline" onPress={onCancel} disabled={deleting} />
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
