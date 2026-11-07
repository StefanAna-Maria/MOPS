import { useState } from "react";
import { Alert } from "react-native";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { TextField } from "@/components/text-field";
import { PrimaryButton } from "@/components/primary-button";
import { apiFetch } from "@/lib/api";
import { useProfile } from "@/lib/profile-context";
import { showServerUnavailable } from "@/lib/alerts";

export default function OnboardingNameScreen() {
  const { setProfile } = useProfile();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);

  const canContinue = firstName.trim().length > 0 && lastName.trim().length > 0;

  async function handleContinue() {
    setLoading(true);
    try {
      const response = await apiFetch("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      if (!response.ok) {
        Alert.alert("Nu am putut salva numele", "Încearcă din nou.");
        return;
      }
      const data = await response.json();
      setProfile(data.profile);
    } catch {
      showServerUnavailable();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Cum te numești?" subtitle="Așa te vom saluta în aplicație.">
      <Card>
        <TextField
          label="Prenume"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          maxLength={50}
        />
        <TextField
          label="Nume"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          maxLength={50}
        />
        <PrimaryButton title="Continuă" onPress={handleContinue} disabled={!canContinue} loading={loading} />
      </Card>
    </Screen>
  );
}
