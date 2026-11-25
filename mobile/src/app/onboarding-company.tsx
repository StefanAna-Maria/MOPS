import { Screen } from "@/components/screen";
import { CompanyForm } from "@/components/company-form";
import { useT } from "@/i18n";

export default function OnboardingCompanyScreen() {
  const t = useT();
  return (
    <Screen title={t.company.onboardingTitle} subtitle={t.company.onboardingSubtitle}>
      <CompanyForm submitTitle={t.common.continue} onSaved={() => {}} />
    </Screen>
  );
}
