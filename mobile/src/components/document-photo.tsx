import { useEffect, useState } from "react";
import { Image, StyleSheet } from "react-native";
import { authClient } from "@/lib/auth-client";
import { API_URL } from "@/lib/config";
import { REVIEW_MESSAGES } from "@/lib/expense-messages";
import { colors, radius } from "@/constants/theme";

export function DocumentPhoto({ fileId }: { fileId: string }) {
  const [cookie, setCookie] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    authClient
      .getCookie()
      .then((value) => {
        if (!ignore) {
          setCookie(value);
        }
      })
      .catch(() => {
        if (!ignore) {
          setCookie("");
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (cookie === null) {
    return null;
  }

  return (
    <Image
      accessibilityLabel={REVIEW_MESSAGES.photo}
      source={{
        uri: `${API_URL}/api/scans/${encodeURIComponent(fileId)}/image`,
        headers: cookie ? { Cookie: cookie } : undefined,
      }}
      resizeMode="contain"
      style={styles.photo}
    />
  );
}

const styles = StyleSheet.create({
  photo: {
    width: "100%",
    height: 360,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
  },
});
