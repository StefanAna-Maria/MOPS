import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { CompanyForm } from "@/components/company-form";
import { BackLink } from "@/components/back-link";
import { useProfile } from "@/lib/profile-context";
import { useT } from "@/i18n";

export default function AddCompanyScreen() {
  const t = useT();
  const { setActiveContext } = useProfile();

  return (
    <Screen title={t.company.addTitle} subtitle={t.company.addSubtitle}>
      <CompanyForm
        submitTitle={t.company.save}
        onSaved={() => {
          setActiveContext("company");
          router.back();
        }}
      />
      <BackLink>{t.common.cancel}</BackLink>
    </Screen>
  );
}
