import type React from "react";
import { Alert, Linking } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router, useIsFocused } from "expo-router";
import { useCameraPermissions } from "expo-camera";
import ScanScreen from "@/app/(app)/scan";

const mockTakePictureAsync = jest.fn();

jest.mock("expo-camera", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { View: RNView } = jest.requireActual<typeof import("react-native")>("react-native");

  const MockCameraView = ReactActual.forwardRef(function MockCameraView(
    props: Record<string, unknown>,
    ref: React.ForwardedRef<{ takePictureAsync: jest.Mock }>,
  ) {
    ReactActual.useImperativeHandle(ref, () => ({
      takePictureAsync: mockTakePictureAsync,
    }));
    return ReactActual.createElement(RNView, props);
  });

  return {
    CameraView: MockCameraView,
    useCameraPermissions: jest.fn(),
  };
});

const mockUseCameraPermissions = useCameraPermissions as unknown as jest.Mock;
const mockUseIsFocused = useIsFocused as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseIsFocused.mockReturnValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
});

describe("Fotografierea unui document cu camera (US-08)", () => {
  it("CA-08.1: without permission (canAskAgain = true), shows the explanation and Permite accesul", async () => {
    const requestPermission = jest.fn().mockResolvedValue({ granted: true });
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, status: "undetermined", canAskAgain: true },
      requestPermission,
    ]);

    await render(<ScanScreen />);

    expect(screen.getByText("Acces la cameră")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Avem nevoie de acces la cameră pentru a fotografia bonurile și facturile tale, ca să nu le mai păstrezi pe hârtie.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("camera-view")).toBeNull();

    const allowButton = screen.getByRole("button", { name: "Permite accesul" });
    await fireEvent.press(allowButton);

    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("CA-08.1: when permission is permanently denied (canAskAgain = false), shows the explanation and Deschide setările", async () => {
    const requestPermission = jest.fn();
    mockUseCameraPermissions.mockReturnValue([
      { granted: false, status: "denied", canAskAgain: false },
      requestPermission,
    ]);

    await render(<ScanScreen />);

    expect(screen.getByText("Acces la cameră")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Ai refuzat accesul la cameră. Pentru a fotografia un bon și a nu-l mai păstra pe hârtie, activează permisiunea din setările telefonului.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Permite accesul" })).toBeNull();

    const settingsButton = screen.getByRole("button", { name: "Deschide setările" });
    await fireEvent.press(settingsButton);

    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  it("CA-08.2: viewfinder displays the document frame and shutter button; taking a photo shows it with Refă poza and Continuă", async () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, status: "granted", canAskAgain: true },
      jest.fn(),
    ]);
    mockTakePictureAsync.mockResolvedValue({
      uri: "file:///cache/receipt-01.jpg",
      width: 1080,
      height: 1920,
    });

    await render(<ScanScreen />);

    expect(screen.getByTestId("camera-view")).toBeOnTheScreen();
    expect(screen.getByLabelText("Chenarul documentului")).toBeOnTheScreen();

    const shutter = screen.getByRole("button", { name: "Declanșator" });
    await fireEvent.press(shutter);

    expect(mockTakePictureAsync).toHaveBeenCalledWith({ quality: 0.85 });
    expect(screen.getByLabelText("Poza documentului")).toBeOnTheScreen();
    expect(screen.queryByTestId("camera-view")).toBeNull();

    const retakeButton = screen.getByRole("button", { name: "Refă poza" });
    const continueButton = screen.getByRole("button", { name: "Continuă" });
    expect(retakeButton).toBeOnTheScreen();
    expect(continueButton).toBeOnTheScreen();

    await fireEvent.press(retakeButton);

    expect(screen.queryByLabelText("Poza documentului")).toBeNull();
    expect(screen.getByTestId("camera-view")).toBeOnTheScreen();
    expect(screen.getByLabelText("Chenarul documentului")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Declanșator" }));
    await fireEvent.press(screen.getByRole("button", { name: "Continuă" }));

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("CA-08.3: stops the camera when leaving the screen", async () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, status: "granted", canAskAgain: true },
      jest.fn(),
    ]);

    const { rerender, unmount } = await render(<ScanScreen />);
    expect(screen.getByTestId("camera-view")).toBeOnTheScreen();

    mockUseIsFocused.mockReturnValue(false);
    await rerender(<ScanScreen />);

    expect(screen.queryByTestId("camera-view")).toBeNull();

    unmount();
    expect(screen.queryByTestId("camera-view")).toBeNull();
  });

  it("CA-08.3: pressing Închide camera navigates back from the screen", async () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, status: "granted", canAskAgain: true },
      jest.fn(),
    ]);

    await render(<ScanScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Închide camera" }));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
