import { ImageManipulator, SaveFormat, type ActionCrop } from "expo-image-manipulator";

export type Size = {
  width: number;
  height: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const DOCUMENT_FRAME_ASPECT_RATIO = 0.68;
export const DOCUMENT_FRAME_MAX_WIDTH = 320;
export const DOCUMENT_FRAME_HORIZONTAL_PADDING = 48;

export function getDefaultDocumentFrameRect(viewport: Size): Rect {
  const width = Math.min(
    Math.max(1, viewport.width - DOCUMENT_FRAME_HORIZONTAL_PADDING),
    DOCUMENT_FRAME_MAX_WIDTH,
  );
  const height = width / DOCUMENT_FRAME_ASPECT_RATIO;
  const x = Math.max(0, (viewport.width - width) / 2);
  const y = Math.max(0, (viewport.height - height) / 2);

  return { x, y, width, height };
}

export function computeFrameCropRect(
  photoSize: Size,
  viewportSize: Size,
  frameRect: Rect,
): ActionCrop["crop"] {
  const photoW = Math.max(1, photoSize.width);
  const photoH = Math.max(1, photoSize.height);
  const viewW = Math.max(1, viewportSize.width);
  const viewH = Math.max(1, viewportSize.height);

  const scale = Math.max(viewW / photoW, viewH / photoH);
  const scaledPhotoW = photoW * scale;
  const scaledPhotoH = photoH * scale;

  const offsetX = (scaledPhotoW - viewW) / 2;
  const offsetY = (scaledPhotoH - viewH) / 2;

  const rawOriginX = (frameRect.x + offsetX) / scale;
  const rawOriginY = (frameRect.y + offsetY) / scale;
  const rawWidth = frameRect.width / scale;
  const rawHeight = frameRect.height / scale;

  const originX = Math.max(0, Math.min(photoW - 1, Math.round(rawOriginX)));
  const originY = Math.max(0, Math.min(photoH - 1, Math.round(rawOriginY)));
  const width = Math.max(1, Math.min(photoW - originX, Math.round(rawWidth)));
  const height = Math.max(1, Math.min(photoH - originY, Math.round(rawHeight)));

  return { originX, originY, width, height };
}

export async function cropPhotoToDocumentFrame(
  photo: { uri: string; width: number; height: number },
  viewportSize: Size,
  frameRect: Rect,
): Promise<string> {
  if (photo.width <= 0 || photo.height <= 0) {
    return photo.uri;
  }

  const cropRect = computeFrameCropRect(
    { width: photo.width, height: photo.height },
    viewportSize,
    frameRect,
  );

  const context = ImageManipulator.manipulate(photo.uri);
  context.crop(cropRect);
  const renderedImage = await context.renderAsync();
  const savedImage = await renderedImage.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.9,
  });

  context.release?.();
  renderedImage.release?.();

  return savedImage.uri;
}

