import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Company, MeResponse, Profile } from "@ocrinvoice/shared";
import { authClient } from "./auth-client";
import { apiFetch } from "./api";

type MeData = {
  userId: string;
  profile: Profile;
  company: Company | null;
};

type MeResult = { status: "ok"; data: MeData } | { status: "error" };

export type ActiveContext = "personal" | "company";

type ProfileContextValue = {
  profile: Profile | null;
  company: Company | null;
  activeContext: ActiveContext;
  isLoading: boolean;
  hasError: boolean;
  reload: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  setCompany: (company: Company) => void;
  setActiveContext: (context: ActiveContext) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

async function fetchMe(): Promise<MeResult> {
  try {
    const response = await apiFetch("/api/me");
    if (!response.ok) {
      return { status: "error" };
    }
    const data: MeResponse = await response.json();
    return { status: "ok", data: { userId: data.user.id, profile: data.profile, company: data.company } };
  } catch {
    return { status: "error" };
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const [me, setMe] = useState<MeData | null>(null);
  const [errorUserId, setErrorUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chosenContext, setActiveContext] = useState<ActiveContext | null>(null);

  const current = me && me.userId === userId ? me : null;
  const personalAvailable = current?.profile.personalEnabled ?? true;
  const companyAvailable = !!current?.company;
  const activeContext: ActiveContext =
    chosenContext === "company" && companyAvailable
      ? "company"
      : chosenContext === "personal" && personalAvailable
        ? "personal"
        : personalAvailable
          ? "personal"
          : "company";
  const hasError = !!userId && errorUserId === userId;

  const applyResult = useCallback((result: MeResult, forUserId: string) => {
    if (result.status === "error") {
      setErrorUserId(forUserId);
    } else {
      setMe(result.data);
      setErrorUserId(null);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let ignore = false;
    async function loadMe(forUserId: string) {
      const result = await fetchMe();
      if (!ignore) {
        applyResult(result, forUserId);
      }
    }
    loadMe(userId);
    return () => {
      ignore = true;
    };
  }, [userId, applyResult]);

  const reload = useCallback(async () => {
    if (!userId) {
      return;
    }
    setIsLoading(true);
    const result = await fetchMe();
    applyResult(result, userId);
    setIsLoading(false);
  }, [userId, applyResult]);

  const setProfile = useCallback((profile: Profile) => {
    setMe((previous) => (previous ? { ...previous, profile } : previous));
  }, []);

  const setCompany = useCallback((company: Company) => {
    setMe((previous) => (previous ? { ...previous, company } : previous));
  }, []);

  return (
    <ProfileContext.Provider
      value={{
        profile: current?.profile ?? null,
        company: current?.company ?? null,
        activeContext,
        isLoading,
        hasError,
        reload,
        setProfile,
        setCompany,
        setActiveContext,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return value;
}
