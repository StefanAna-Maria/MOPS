import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CATEGORY_NAME_MAX_LENGTH, type CategoryOption } from "@ocrinvoice/shared";
import { BottomSheet } from "@/components/bottom-sheet";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { createCategory, deleteCategory, saveCategoryOrder, type CategoryError } from "@/lib/categories";
import { CATEGORY_MESSAGES } from "@/lib/expense-messages";
import { categoryLabel } from "@/lib/expense-list";
import { useT } from "@/i18n";
import { showServerUnavailable } from "@/lib/alerts";
import { colors, radius, spacing, typography } from "@/constants/theme";

/** "Altele" is the default and can never be removed. */
const DEFAULT_CATEGORY_ID = "OTHER";

type CategoryFieldProps = {
  /** Defaults to "Categorie". */
  label?: string;
  value: string;
  categories: CategoryOption[];
  onChange: (id: string) => void;
  onCategoriesChange: (categories: CategoryOption[]) => void;
};

function showError(error: CategoryError, count?: number) {
  if (error === "NETWORK") {
    showServerUnavailable();
  } else if (error === "IN_USE") {
    Alert.alert(CATEGORY_MESSAGES.inUseTitle, CATEGORY_MESSAGES.inUse(count));
  } else if (error === "EXISTS") {
    Alert.alert(CATEGORY_MESSAGES.failedTitle, CATEGORY_MESSAGES.exists);
  } else {
    Alert.alert(CATEGORY_MESSAGES.failedTitle, CATEGORY_MESSAGES.invalid);
  }
}

/**
 * US-03: chooses the expense's category, and lets the user add their own categories and remove the ones they do not
 * use (their own are deleted, built-in ones hidden; one used by an expense cannot be removed, nor "Altele").
 */
export function CategoryField({
  label = CATEGORY_MESSAGES.title,
  value,
  categories,
  onChange,
  onCategoriesChange,
}: CategoryFieldProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  // US-03: moving categories into the user's own order. The draft is saved with "Gata"; closing the sheet drops it.
  const [draft, setDraft] = useState<CategoryOption[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const reordering = draft !== null;

  const t = useT();
  const nameOf = (category: CategoryOption) => (category.builtIn ? categoryLabel(category.id) : category.name);
  const selected = categories.find((category) => category.id === value);
  const selectedName = selected ? nameOf(selected) : t.categories.OTHER;

  async function handleAdd() {
    const name = newName.trim();
    if (!name || adding) {
      return;
    }
    setAdding(true);
    const result = await createCategory(name);
    setAdding(false);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    const created = result.value;
    const others = categories.filter((category) => category.id !== created.id);
    // New categories go just before "Altele", like the server lists them.
    const otherIndex = others.findIndex((category) => category.id === DEFAULT_CATEGORY_ID);
    const next = otherIndex === -1 ? [...others, created] : [...others.slice(0, otherIndex), created, ...others.slice(otherIndex)];
    onCategoriesChange(next);
    onChange(created.id);
    setNewName("");
    close();
  }

  function move(index: number, by: -1 | 1) {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const target = index + by;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function saveOrder() {
    if (!draft || savingOrder) {
      return;
    }
    setSavingOrder(true);
    const result = await saveCategoryOrder(draft.map((category) => category.id));
    setSavingOrder(false);
    if (!result.ok) {
      if (result.error === "NETWORK") {
        showServerUnavailable();
      } else {
        Alert.alert(CATEGORY_MESSAGES.orderFailedTitle, CATEGORY_MESSAGES.orderFailed);
      }
      return;
    }
    onCategoriesChange(result.value);
    setDraft(null);
  }

  function close() {
    setDraft(null);
    setOpen(false);
  }

  function handleDelete(category: CategoryOption) {
    Alert.alert(CATEGORY_MESSAGES.confirmTitle, CATEGORY_MESSAGES.confirmText(nameOf(category)), [
      { text: CATEGORY_MESSAGES.cancel, style: "cancel" },
      {
        text: CATEGORY_MESSAGES.confirmDelete,
        style: "destructive",
        onPress: async () => {
          const result = await deleteCategory(category.id);
          if (!result.ok) {
            showError(result.error, result.count);
            return;
          }
          onCategoriesChange(categories.filter((item) => item.id !== category.id));
          if (value === category.id) {
            onChange(DEFAULT_CATEGORY_ID);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedName}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.box, pressed && styles.pressed]}
      >
        <Text style={styles.value}>{selectedName}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <BottomSheet visible={open} title={CATEGORY_MESSAGES.title} onClose={close}>
        {reordering ? (
          <Text style={styles.hint}>{CATEGORY_MESSAGES.reorderHint}</Text>
        ) : (
          <PrimaryButton
            title={CATEGORY_MESSAGES.reorder}
            variant="outline"
            onPress={() => setDraft(categories)}
            disabled={categories.length < 2}
          />
        )}
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {reordering
            ? draft.map((category, index) => (
                <View key={category.id} style={styles.row}>
                  <Text style={[styles.rowText, styles.rowTextReorder]}>{nameOf(category)}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={CATEGORY_MESSAGES.moveUp(nameOf(category))}
                    accessibilityState={{ disabled: index === 0 }}
                    disabled={index === 0}
                    onPress={() => move(index, -1)}
                    hitSlop={4}
                    style={({ pressed }) => [styles.moveButton, index === 0 && styles.moveDisabled, pressed && styles.pressed]}
                  >
                    <Ionicons name="chevron-up" size={20} color={colors.textPrimary} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={CATEGORY_MESSAGES.moveDown(nameOf(category))}
                    accessibilityState={{ disabled: index === draft.length - 1 }}
                    disabled={index === draft.length - 1}
                    onPress={() => move(index, 1)}
                    hitSlop={4}
                    style={({ pressed }) => [
                      styles.moveButton,
                      index === draft.length - 1 && styles.moveDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
                  </Pressable>
                </View>
              ))
            : categories.map((category) => {
            const isSelected = category.id === value;
            return (
              <View key={category.id} style={[styles.row, isSelected && styles.rowSelected]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={nameOf(category)}
                  onPress={() => {
                    onChange(category.id);
                    close();
                  }}
                  style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                >
                  <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>{nameOf(category)}</Text>
                  {isSelected ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                </Pressable>
                {category.id !== DEFAULT_CATEGORY_ID ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={CATEGORY_MESSAGES.delete(nameOf(category))}
                    onPress={() => handleDelete(category)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
        {reordering ? (
          <PrimaryButton title={CATEGORY_MESSAGES.done} onPress={saveOrder} loading={savingOrder} />
        ) : (
        <View style={styles.newCategory}>
          <TextField
            label={CATEGORY_MESSAGES.newLabel}
            value={newName}
            onChangeText={setNewName}
            placeholder={CATEGORY_MESSAGES.newPlaceholder}
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
          <PrimaryButton
            title={CATEGORY_MESSAGES.add}
            variant="outline"
            onPress={handleAdd}
            disabled={!newName.trim()}
            loading={adding}
          />
        </View>
        )}
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
    height: 48,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.85,
  },
  value: {
    ...typography.bodyLg,
    flex: 1,
    color: colors.textPrimary,
  },
  chevron: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowText: {
    ...typography.headlineSm,
    flex: 1,
    color: colors.textPrimary,
  },
  rowTextSelected: {
    color: colors.primary,
  },
  hint: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  rowTextReorder: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  moveButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  moveDisabled: {
    opacity: 0.25,
  },
  deleteButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  newCategory: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
