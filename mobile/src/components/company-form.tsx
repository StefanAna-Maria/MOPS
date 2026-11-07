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

type CompanyFormProps = {
  submitTitle: string;
  onSaved: (company: Company) => void;
};

export function CompanyForm({ submitTitle, onSaved }: CompanyFormProps) {
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
          Alert.alert("CUI invalid", "Verifică CUI-ul și încearcă din nou.");
        } else {
          Alert.alert("Nu am putut salva firma", "Verifică datele și încearcă din nou.");
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
          label="CUI"
          value={cui}
          onChangeText={setCui}
          placeholder="RO12345678"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={14}
        />
        {showCuiError ? <Text style={styles.error}>CUI-ul nu este valid.</Text> : null}
      </View>
      <TextField label="Denumire" value={name} onChangeText={setName} placeholder="Exemplu SRL" maxLength={200} />
      <TextField
        label="Adresă"
        value={address}
        onChangeText={setAddress}
        placeholder="Str. Exemplu nr. 1, București"
        maxLength={300}
      />
      <TextField
        label="Nr. Registrul Comerțului (opțional)"
        value={registrationNumber}
        onChangeText={setRegistrationNumber}
        placeholder="J40/1234/2020"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={30}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Plătitor de TVA</Text>
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
