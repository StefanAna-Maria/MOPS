import { Alert } from "react-native";
import { t } from "@/i18n";

export function showServerUnavailable() {
  const { common } = t();
  Alert.alert(common.serverUnavailableTitle, common.serverUnavailable);
}

export function showTooManyAttempts() {
  const { common } = t();
  Alert.alert(common.tooManyAttemptsTitle, common.tooManyAttempts);
}
