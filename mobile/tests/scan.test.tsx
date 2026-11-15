import type React from "react";
import { Alert, Linking } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router, useIsFocused } from "expo-router";
import { useCameraPermissions } from "expo-camera";
import { ImageManipulator } from "expo-image-manipulator";
import ScanScreen from "@/app/(app)/scan";
import { computeFrameCropRect } from "@/lib/crop-frame";
import { uploadScan } from "@/lib/scan-upload";

// US-09: "Continuă" uploads the photo; the upload itself is tested in scan-upload.test.ts.
jest.mock("@/lib/scan-upload", () => ({ uploadScan: jest.fn() }));
jest.mock("@/lib/profile-context", () => ({ useProfile: () => ({ activeContext: "personal" }) }));
const mockUploadScan = uploadScan as unknown as jest.Mock;

const mockTakePictureAsync = jest.fn();
const mockCrop = jest.fn();
const mockRenderAsync = jest.fn();
const mockSaveAsync = jest.fn();
const mockRelease = jest.fn();

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

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      crop: mockCrop,
      renderAsync: mockRenderAsync,
      release: mockRelease,
    })),
  },
}));

const mockUseCameraPermissions = useCameraPermissions as unknown as jest.Mock;
const mockUseIsFocused = useIsFocused as unknown as jest.Mock;
const mockManipulate = ImageManipulator.manipulate as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseIsFocused.mockReturnValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);

  mockSaveAsync.mockResolvedValue({
    uri: "file:///cache/receipt-01-cropped.jpg",
    width: 728,
    height: 1071,
  });
  mockRenderAsync.mockResolvedValue({
    width: 728,
    height: 1071,
    saveAsync: mockSaveAsync,
    release: mockRelease,
  });
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

  it("CA-08.2: viewfinder displays the document frame and shutter button; taking a photo crops it to the frame and shows it with Refă poza and Continuă", async () => {
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
    expect(mockManipulate).toHaveBeenCalledWith("file:///cache/receipt-01.jpg");
    expect(mockCrop).toHaveBeenCalledWith({
      originX: expect.any(Number),
      originY: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });

    const previewImage = screen.getByLabelText("Poza documentului");
    expect(previewImage).toBeOnTheScreen();
    expect(previewImage.props.source).toEqual({ uri: "file:///cache/receipt-01-cropped.jpg" });
    expect(screen.queryByTestId("camera-view")).toBeNull();

    const retakeButton = screen.getByRole("button", { name: "Refă poza" });
    const continueButton = screen.getByRole("button", { name: "Continuă" });
    expect(retakeButton).toBeOnTheScreen();
    expect(continueButton).toBeOnTheScreen();

    await fireEvent.press(retakeButton);

    expect(screen.queryByLabelText("Poza documentului")).toBeNull();
    expect(screen.getByTestId("camera-view")).toBeOnTheScreen();
    expect(screen.getByLabelText("Chenarul documentului")).toBeOnTheScreen();

    mockUploadScan.mockResolvedValue({ id: "scan-1", status: "PROCESSING" });
    await fireEvent.press(screen.getByRole("button", { name: "Declanșator" }));
    await fireEvent.press(screen.getByRole("button", { name: "Continuă" }));

    // US-09: Continuă uploads the cropped photo and opens the reading screen.
    expect(mockUploadScan).toHaveBeenCalledWith("file:///cache/receipt-01-cropped.jpg", "personal");
    expect(router.replace).toHaveBeenCalledWith({ pathname: "/scan-result/[id]", params: { id: "scan-1" } });
  });

  it("CA-09.1: shows an alert and keeps the photo when the upload fails", async () => {
    mockUseCameraPermissions.mockReturnValue([
      { granted: true, status: "granted", canAskAgain: true },
      jest.fn(),
    ]);
    mockUploadScan.mockRejectedValue(new Error("Network request failed"));
    await render(<ScanScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Declanșator" }));
    await fireEvent.press(screen.getByRole("button", { name: "Continuă" }));

    expect(Alert.alert).toHaveBeenCalledWith("Nu am putut trimite poza", expect.any(String));
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Poza documentului")).toBeOnTheScreen();
  });

  it("CA-08.2: computeFrameCropRect maps the viewfinder document frame coordinates to the captured image pixels", () => {
    const crop = computeFrameCropRect(
      { width: 1080, height: 1920 },
      { width: 390, height: 844 },
      { x: 35, y: 187, width: 320, height: 470 },
    );

    expect(crop).toEqual({
      originX: 176,
      originY: 425,
      width: 728,
      height: 1069,
    });
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
