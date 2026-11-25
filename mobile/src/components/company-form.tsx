import { useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { Card } from "@/components/card";
import { TextField } from "@/components/text-field";
import { PrimaryButton } from "@/components/primary-button";
import { apiFetch } from "@/lib/api";
import { isValidCui, type Company } from "@ocrinvoice/shared";
import { useProfile } from "@/lib/profile-context";
import { showServerUnavailable } from "@/lib/alerts";
import { colors, spacing, typography } from "@/constants/theme";
import { useT } from "@/i18n";

type CompanyFormProps = {
  submitTitle: string;
  onSaved: (company: Company) => void;
};

export function CompanyForm({ submitTitle, onSaved }: CompanyFormProps) {
  const t = useT();
  const { setCompany, reload } = useProfile();
  const [cui, setCui] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [vatPayer, setVatPayer] = useState(false);
  const [loading, setLoading] = useState(false);

  const cuiValid = isValidCui(cui);
  const showCuiError = cui.trim().length > 0 && !cuiValid;
  const canSubmit = cuiValid && name.trim().length > 0 && address.trim().length > 0;

  async function handleSubmit() {
    setLoading(true);
    try {
      const response = await apiFetch("/api/company", {
        method: "POST",
        body: JSON.stringify({
          cui,
          name: name.trim(),
          address: address.trim(),
          registrationNumber: registrationNumber.trim(),
          vatPayer,
        }),
      });
      if (response.status === 409) {
        await reload();
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.code === "INVALID_CUI") {
          Alert.alert(t.company.cuiInvalidTitle, t.company.cuiInvalidRetry);
        } else {
          Alert.alert(t.company.saveFailedTitle, t.common.checkDataAndRetry);
        }
        return;
      }
      const data = await response.json();
      setCompany(data.company);
      onSaved(data.company);
    } catch {
      showServerUnavailable();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <View style={styles.field}>
        <TextField
          label={t.company.cui}
          value={cui}
          onChangeText={setCui}
          placeholder="RO12345678"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={14}
        />
        {showCuiError ? <Text style={styles.error}>{t.company.cuiInvalid}</Text> : null}
      </View>
      <TextField
        label={t.company.name}
        value={name}
        onChangeText={setName}
        placeholder={t.company.namePlaceholder}
        maxLength={200}
      />
      <TextField
        label={t.company.address}
        value={address}
        onChangeText={setAddress}
        placeholder={t.company.addressPlaceholder}
        maxLength={300}
      />
      <TextField
        label={t.company.registrationNumber}
        value={registrationNumber}
        onChangeText={setRegistrationNumber}
        placeholder="J40/1234/2020"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={30}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t.company.vatPayer}</Text>
        <Switch
          value={vatPayer}
          onValueChange={setVatPayer}
          trackColor={{ false: colors.borderStrong, true: colors.primary }}
          thumbColor={colors.white}
        />
      </View>
      <PrimaryButton title={submitTitle} onPress={handleSubmit} disabled={!canSubmit} loading={loading} />
    </Card>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  error: {
    ...typography.bodySm,
    color: colors.error,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: {
    ...typography.label,
    color: colors.textBody,
  },
});
