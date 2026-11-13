import { Screen } from "@/components/screen";
import { CompanyForm } from "@/components/company-form";

export default function OnboardingCompanyScreen() {
  return (
    <Screen title="Datele firmei" subtitle="Le folosim pentru cheltuielile firmei tale.">
      <CompanyForm submitTitle="Continuă" onSaved={() => {}} />
    </Screen>
  );
}
