import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { cropRect } from './box-geometry';
import { describeImage, log } from './log';
import type { DetectionBox } from './scan-normalize';

/**
 * Gets a camera photo down to something worth uploading.
 *
 * Straight off the picker at quality 0.5 a single iPhone photo is still ~950KB
 * of base64 and took 24 seconds to scan end to end. Six of those would pass the
 * function's own timeout, and a pantry's wifi is not a datacentre link.
 *
 * Resizing to 1280px on the long edge cuts that by roughly an order of
 * magnitude. It costs nothing in accuracy that matters here: 1280px is still
 * far more than Gemini needs to read a product label, and the model downsamples
 * to its own tile size regardless.
 */

/** Long edge in pixels. Comfortably above what label OCR needs. */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.55;

export interface PreparedPhoto {
  uri: string;
  base64: string;
  /** Dimensions of the image the model actually saw — detection boxes are
   *  normalised against these, so they must travel together. */
  width: number;
  height: number;
}

const fallback = (asset: ImagePickerAsset): PreparedPhoto | null =>
  asset.base64
    ? { uri: asset.uri, base64: asset.base64, width: asset.width, height: asset.height }
    : null;

export async function preparePhoto(asset: ImagePickerAsset): Promise<PreparedPhoto | null> {
  const longEdge = Math.max(asset.width ?? 0, asset.height ?? 0);

  try {
    // Already small enough, and the picker gave us base64 — nothing to gain.
    if (longEdge > 0 && longEdge <= MAX_EDGE && asset.base64) {
      log.debug('scan', `photo already ${longEdge}px, using as-is: ${describeImage(asset.base64)}`);
      return {
        uri: asset.uri,
        base64: asset.base64,
        width: asset.width,
        height: asset.height,
      };
    }

    const context = ImageManipulator.manipulate(asset.uri);
    // Height follows automatically, so the aspect ratio is preserved.
    context.resize(
      (asset.width ?? 0) >= (asset.height ?? 0) ? { width: MAX_EDGE } : { height: MAX_EDGE },
    );

    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      base64: true,
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });

    if (!result.base64) {
      log.warn('scan', 'resize produced no base64, falling back to the original');
      return fallback(asset);
    }

    log.debug(
      'scan',
      `resized ${longEdge}px → ${MAX_EDGE}px: ` +
        `${asset.base64 ? describeImage(asset.base64) : 'unknown'} → ${describeImage(result.base64)}`,
    );

    return {
      uri: result.uri,
      base64: result.base64,
      width: result.width,
      height: result.height,
    };
  } catch (err) {
    // A failed resize must not cost the volunteer the photo they just took.
    log.error('scan', 'resize failed, using the original photo', err);
    return fallback(asset);
  }
}

/**
 * Cuts one detection box out of a photo and returns it as base64 JPEG.
 *
 * `edge` is the long edge of the result. With `allowUpscale` off, a crop that is
 * already smaller is left alone: enlarging adds bytes, not detail. That matters
 * when the crop goes to the model, and doesn't when it becomes a 44px thumbnail.
 */
export async function cropRegion(
  source: { uri: string; width: number; height: number },
  box: DetectionBox,
  options: { padding: number; edge: number; allowUpscale: boolean; quality: number },
): Promise<string | null> {
  const rect = cropRect(box, source.width, source.height, options.padding);
  if (!rect) return null;

  const context = ImageManipulator.manipulate(source.uri);
  context.crop(rect);

  if (options.allowUpscale || Math.max(rect.width, rect.height) > options.edge) {
    context.resize(rect.width >= rect.height ? { width: options.edge } : { height: options.edge });
  }

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    base64: true,
    compress: options.quality,
    format: SaveFormat.JPEG,
  });
  return result.base64 ?? null;
}

/**
 * A copy of a photo cut down to `region` (fractions of the photo), for showing
 * on screen. Review uses it to zoom onto the part of the picture that actually
 * has the donation in it. The manipulator writes pixels in display orientation,
 * so a photo stored sideways comes out upright.
 *
 * Display only: the scan pipeline and the item crops keep using the full photo
 * and its own box coordinates.
 */
export async function cropForDisplay(
  source: { uri: string; width: number; height: number },
  region: DetectionBox,
): Promise<{ uri: string; width: number; height: number } | null> {
  try {
    const rect = {
      originX: Math.round(region.left * source.width),
      originY: Math.round(region.top * source.height),
      width: Math.round(region.width * source.width),
      height: Math.round(region.height * source.height),
    };
    if (rect.width < 32 || rect.height < 32) return null;
    const context = ImageManipulator.manipulate(source.uri);
    context.crop(rect);
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
    return { uri: result.uri, width: result.width, height: result.height };
  } catch (err) {
    log.warn('scan', 'display crop failed, showing the whole photo', err);
    return null;
  }
}

