import { StyleSheet } from "react-native";
import { Link, type Href } from "expo-router";
import { colors, typography } from "@/constants/theme";

type TextLinkProps = {
  href: Href;
  children: string;
  align?: "center" | "right";
};

export function TextLink({ href, children, align = "center" }: TextLinkProps) {
  return (
    <Link href={href} style={[styles.link, align === "right" ? styles.right : styles.center]}>
      {children}
    </Link>
  );
}

const styles = StyleSheet.create({
  link: {
    ...typography.label,
    color: colors.primary,
  },
  center: {
    alignSelf: "center",
  },
  right: {
    alignSelf: "flex-end",
  },
});
