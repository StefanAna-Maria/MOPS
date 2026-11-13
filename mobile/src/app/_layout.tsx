import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { useFonts } from "expo-font";
import { PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { PrimaryButton } from "@/components/primary-button";
import { BrandLoading } from "@/components/brand-loading";
import { AppLoader } from "@/components/app-loader";
import { authClient } from "@/lib/auth-client";
import { ProfileProvider, useProfile } from "@/lib/profile-context";
import { hasSignedOutThisSession } from "@/lib/sign-out";
import { colors, spacing, typography } from "@/constants/theme";

SplashScreen.preventAutoHideAsync();

const MINIMUM_LOADING_MS = 900;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hide();
    }
  }, [fontsReady]);

  if (!fontsReady) {
    return null;
  }

  return (
    <ProfileProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </ProfileProvider>
  );
}

function RootNavigator() {
  const { data: session, isPending } = authClient.useSession();
  const { profile, company, isLoading, hasError, reload } = useProfile();

  const [minimumElapsed, setMinimumElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinimumElapsed(true), MINIMUM_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);

  const [hasStarted, setHasStarted] = useState(false);

  const isSignedIn = !!session;
  const isReady = !isPending && (!isSignedIn || !!profile || hasError);

  if (!hasStarted && isReady && minimumElapsed) {
    setHasStarted(true);
  }

  if (!hasStarted) {
    return <BrandLoading />;
  }

  if (!isReady) {
    return <AppLoader />;
  }

  if (isSignedIn && hasError) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorTitle}>Serverul nu răspunde</Text>
        <Text style={styles.errorText}>Verifică conexiunea la internet și încearcă din nou.</Text>
        <PrimaryButton title="Încearcă din nou" onPress={reload} loading={isLoading} />
      </View>
    );
  }

  const hasName = !!profile?.firstName;
  const needsCompany = !!profile && !profile.personalEnabled && !company;
  const isComplete = isSignedIn && hasName && !needsCompany;

  const currentStep = !isSignedIn
    ? hasSignedOutThisSession()
      ? "/sign-in"
      : "/welcome"
    : !hasName
      ? "/onboarding-name"
      : needsCompany
        ? "/onboarding-company"
        : "/";

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={isComplete} redirectTo={currentStep}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn && !hasName} redirectTo={currentStep}>
        <Stack.Screen name="onboarding-name" />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn && hasName && needsCompany} redirectTo={currentStep}>
        <Stack.Screen name="onboarding-company" />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn} redirectTo={currentStep}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  error: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  errorTitle: {
    ...typography.headlineLg,
    color: colors.textPrimary,
  },
  errorText: {
    ...typography.bodyLg,
    color: colors.textSecondary,
  },
});
