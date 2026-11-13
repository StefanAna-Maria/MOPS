import { Alert } from "react-native";

export function showServerUnavailable() {
  Alert.alert("Serverul nu răspunde", "Verifică conexiunea la internet și încearcă din nou.");
}

export function showTooManyAttempts() {
  Alert.alert("Prea multe încercări", "Ai încercat de prea multe ori. Așteaptă un minut și încearcă din nou.");
}
