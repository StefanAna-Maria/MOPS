import { useEffect, useState } from "react";
import {
  DEFAULT_EXPENSE_CATEGORY,
  DEFAULT_PAYMENT_METHOD,
  isDescriptionValid,
  isPaymentDateValid,
  parseAmount,
  parseDisplayDate,
  type CategoryOption,
  type PaymentMethod,
} from "@ocrinvoice/shared";
import { BUILT_IN_CATEGORIES, fetchCategories } from "./categories";
import { localTodayIso } from "./dates";
import { EXPENSE_MESSAGES } from "./expense-messages";

export type ExpenseFormField = "description" | "amount" | "date";

export type ExpenseFormValues = {
  description: string;
  amount: string;
  /** ZZ.LL.AAAA, as typed or picked. */
  date: string;
  /** A built-in code or the id of one of the user's own categories (US-03). */
  category: string;
  paymentMethod: PaymentMethod;
  note: string;
};

export const EMPTY_EXPENSE_VALUES: Omit<ExpenseFormValues, "date"> = {
  description: "",
  amount: "",
  category: DEFAULT_EXPENSE_CATEGORY,
  paymentMethod: DEFAULT_PAYMENT_METHOD,
  note: "",
};

/**
 * The fields of an expense and their checks, shared by "Adaugă o cheltuială" (CA-03) and by the editing of a saved
 * document (CA-13): both must accept and refuse exactly the same values (CA-13.1: "aceleași validări ca la
 * adăugare"). A field's message shows once the user has left it (or tried to save).
 */
export function useExpenseForm(initial: ExpenseFormValues) {
  const [description, setDescription] = useState(initial.description);
  const [amount, setAmount] = useState(initial.amount);
  const [date, setDate] = useState(initial.date);
  const [category, setCategory] = useState<string>(initial.category);
  const [categories, setCategories] = useState<CategoryOption[]>(BUILT_IN_CATEGORIES);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial.paymentMethod);
  const [note, setNote] = useState(initial.note);
  const [touched, setTouched] = useState<Record<ExpenseFormField, boolean>>({
    description: false,
    amount: false,
    date: false,
  });

  // US-03: the user's categories (their own included); the built-in ones are shown until they load.
  useEffect(() => {
    let ignore = false;
    fetchCategories()
      .then((list) => {
        if (!ignore) {
          setCategories(list);
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const normalizedAmount = parseAmount(amount);
  const isoDate = parseDisplayDate(date);
  const valid: Record<ExpenseFormField, boolean> = {
    description: isDescriptionValid(description),
    amount: normalizedAmount !== null,
    date: isPaymentDateValid(isoDate, localTodayIso()),
  };
  const canSubmit = valid.description && valid.amount && valid.date;

  const touch = (field: ExpenseFormField) => () => setTouched((previous) => ({ ...previous, [field]: true }));
  const touchAll = () => setTouched({ description: true, amount: true, date: true });
  const errorFor = (field: ExpenseFormField) => (touched[field] && !valid[field] ? EXPENSE_MESSAGES[field] : null);

  return {
    description,
    setDescription,
    amount,
    setAmount,
    date,
    setDate,
    category,
    setCategory,
    categories,
    setCategories,
    paymentMethod,
    setPaymentMethod,
    note,
    setNote,
    normalizedAmount,
    isoDate,
    canSubmit,
    touch,
    touchAll,
    errorFor,
  };
}

export type ExpenseForm = ReturnType<typeof useExpenseForm>;
