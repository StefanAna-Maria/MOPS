import { useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "@/constants/theme";

type ScreenProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/** Space kept between the focused field and the top of the keyboard. */
const KEYBOARD_MARGIN = spacing.xl;

export function Screen({ title, subtitle, children }: ScreenProps) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const viewportHeight = useRef(0);
  const scrollOffset = useRef(0);

  // When the keyboard opens, scroll the field being typed in (e.g. the note at the bottom of a form) above it.
  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      // Wait a frame so the KeyboardAvoidingView has already shrunk the visible area.
      requestAnimationFrame(() => {
        const input = TextInput.State.currentlyFocusedInput();
        const scroll = scrollRef.current;
        const content = scroll?.getInnerViewRef();
        if (!input || !scroll || !content) {
          return;
        }
        input.measureLayout(
          content,
          (_x, y, _width, height) => {
            const fieldBottom = y + height + KEYBOARD_MARGIN;
            const visibleBottom = scrollOffset.current + viewportHeight.current;
            if (fieldBottom > visibleBottom) {
              scroll.scrollTo({ y: fieldBottom - viewportHeight.current, animated: true });
            }
          },
          () => {},
        );
      });
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Edge-to-edge Android does not resize the window for the keyboard, so pad on both platforms. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onLayout={(event) => {
            viewportHeight.current = event.nativeEvent.layout.height;
          }}
          onScroll={(event) => {
            scrollOffset.current = event.nativeEvent.contentOffset.y;
          }}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.xl,
    justifyContent: "center",
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    ...typography.headlineXl,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.bodyLg,
    color: colors.textSecondary,
  },
});
