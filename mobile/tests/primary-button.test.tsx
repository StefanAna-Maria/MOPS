import { render, screen } from "@testing-library/react-native";
import { PrimaryButton } from "@/components/primary-button";

describe("PrimaryButton", () => {
  it("keeps its label on one line (Înapoi Acasă wrapped on Android)", async () => {
    await render(<PrimaryButton title="Înapoi Acasă" onPress={() => {}} variant="outline" />);

    const label = screen.getByText("Înapoi Acasă");
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.textBreakStrategy).toBe("simple");
  });
});
