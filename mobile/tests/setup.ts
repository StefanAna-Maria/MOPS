jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

jest.mock("expo-router", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
    useFocusEffect: (effect: () => void) => React.useEffect(() => effect(), [effect]),
    useIsFocused: jest.fn(() => true),
    useLocalSearchParams: jest.fn(() => ({})),
    Link: ({ href, children, style }: { href: unknown; children: unknown; style: unknown }) =>
      React.createElement(Text, { accessibilityRole: "link", accessibilityHint: String(href), style }, children),
  };
});

jest.mock("@react-native-community/datetimepicker", () => {
  const React = require("react");
  const { View } = require("react-native");
  const DateTimePicker = (props: Record<string, unknown>) =>
    React.createElement(View, { testID: "date-time-picker", ...props });
  return { __esModule: true, default: DateTimePicker, DateTimePickerAndroid: { open: jest.fn() } };
});
