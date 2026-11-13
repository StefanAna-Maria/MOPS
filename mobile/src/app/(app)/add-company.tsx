import { router } from "expo-router";
import { Screen } from "@/components/screen";
import { CompanyForm } from "@/components/company-form";
import { TextLink } from "@/components/text-link";
import { useProfile } from "@/lib/profile-context";

export default function AddCompanyScreen() {
  const { setActiveContext } = useProfile();

  return (
    <Screen title="Adaugă firma" subtitle="Vei putea trece oricând între profilul personal și firmă.">
      <CompanyForm
        submitTitle="Salvează firma"
        onSaved={() => {
          setActiveContext("company");
          router.back();
        }}
      />
      <TextLink href="/">Renunță</TextLink>
    </Screen>
  );
}
