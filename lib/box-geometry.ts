import type { DetectionBox } from './scan-normalize';

/**
 * The arithmetic behind dragging and drawing detection boxes.
 *
 * Pulled out of the gesture handlers so it can be run and checked without a
 * touchscreen. Every function is marked 'worklet' because it is called from the
 * UI thread during a gesture — they must stay pure and free of closures over
 * anything that lives on the JS side.
 *
 * All values are pixels within the rendered image, except the final conversion
 * back to fractions.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Frame {
  width: number;
  height: number;
}

/** Below this a box is a smudge rather than something a finger can hit. */
export const MIN_BOX_PX = 32;

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

const clamp = (v: number, lo: number, hi: number) => {
  'worklet';
  // A frame smaller than the minimum would invert the bounds; the low edge wins.
  return hi < lo ? lo : Math.min(Math.max(v, lo), hi);
};

/**
 * Slides a box without resizing it, kept fully inside the frame. The box stops
 * at the edge rather than clipping, so a dragged box never loses its handles.
 */
export function moveBox(start: Rect, dx: number, dy: number, frame: Frame): Rect {
  'worklet';
  return {
    x: clamp(start.x + dx, 0, frame.width - start.w),
    y: clamp(start.y + dy, 0, frame.height - start.h),
    w: start.w,
    h: start.h,
  };
}

/**
 * Drags one corner, holding the opposite one still.
 *
 * The subtle half is the top-left pair: moving that edge has to change BOTH the
 * origin and the size, in opposite directions, or the box walks across the image
 * as it is resized.
 */
export function resizeBox(
  corner: Corner,
  start: Rect,
  dx: number,
  dy: number,
  frame: Frame,
): Rect {
  'worklet';
  const movesLeft = corner === 'tl' || corner === 'bl';
  const movesTop = corner === 'tl' || corner === 'tr';

  let x = start.x;
  let w = start.w;
  if (movesLeft) {
    // Cannot pass the right edge (minus the minimum), nor the frame's left.
    const nextX = clamp(start.x + dx, 0, start.x + start.w - MIN_BOX_PX);
    w = start.x + start.w - nextX;
    x = nextX;
  } else {
    w = clamp(start.w + dx, MIN_BOX_PX, frame.width - start.x);
  }

  let y = start.y;
  let h = start.h;
  if (movesTop) {
    const nextY = clamp(start.y + dy, 0, start.y + start.h - MIN_BOX_PX);
    h = start.y + start.h - nextY;
    y = nextY;
  } else {
    h = clamp(start.h + dy, MIN_BOX_PX, frame.height - start.y);
  }

  return { x, y, w, h };
}

/**
 * The rectangle between two fingers-down points.
 *
 * Built from min/max rather than assuming the drag runs down and to the right —
 * dragging up or leftward is just as natural and would otherwise produce a
 * negative width.
 */
export function rectFromDrag(
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
  frame: Frame,
): Rect {
  'worklet';
  const ox = clamp(originX, 0, frame.width);
  const oy = clamp(originY, 0, frame.height);
  const cx = clamp(currentX, 0, frame.width);
  const cy = clamp(currentY, 0, frame.height);

  return {
    x: Math.min(ox, cx),
    y: Math.min(oy, cy),
    w: Math.abs(cx - ox),
    h: Math.abs(cy - oy),
  };
}

/** True when a drag was really a tap and should not become a box. */
export function isTooSmall(rect: Rect): boolean {
  'worklet';
  return rect.w < MIN_BOX_PX || rect.h < MIN_BOX_PX;
}

/** Pixels back to fractions of the image, which is what gets stored. */
export function toFractions(rect: Rect, frame: Frame): DetectionBox {
  'worklet';
  if (frame.width <= 0 || frame.height <= 0) {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
  return {
    left: rect.x / frame.width,
    top: rect.y / frame.height,
    width: rect.w / frame.width,
    height: rect.h / frame.height,
  };
}

/** Fractions back to pixels, for seeding a gesture from stored state. */
export function toPixels(box: DetectionBox, frame: Frame): Rect {
  'worklet';
  return {
    x: box.left * frame.width,
    y: box.top * frame.height,
    w: box.width * frame.width,
    h: box.height * frame.height,
  };
}

/** Below this a crop has nothing worth reading, and the manipulator may refuse it. */
const MIN_CROP_PX = 8;

/**
 * Where to cut a detection box out of its photo, in whole pixels.
 *
 * Shared by item thumbnails and by identifying a hand-drawn box. Both hand the
 * result straight to expo-image-manipulator, which rejects a crop that runs even
 * one pixel past the image. So the four EDGES are clamped and then floored or
 * ceiled, instead of rounding origin and size separately. The old thumbnail code
 * did the latter, where 100.5 rounds to 101 and 1179.5 to 1180, a 1281px crop
 * of a 1280px photo.
 *
 * `padding` is a fraction of the box's own size added on every side, so a label
 * running past the box edge is still in the crop. Returns null when what is left
 * is too small to use.
 */
export function cropRect(
  box: DetectionBox,
  photoWidth: number,
  photoHeight: number,
  padding = 0,
): { originX: number; originY: number; width: number; height: number } | null {
  const W = Math.floor(photoWidth);
  const H = Math.floor(photoHeight);
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

  const padX = box.width * padding;
  const padY = box.height * padding;

  const x0 = Math.floor(clamp((box.left - padX) * W, W));
  const y0 = Math.floor(clamp((box.top - padY) * H, H));
  const x1 = Math.ceil(clamp((box.left + box.width + padX) * W, W));
  const y1 = Math.ceil(clamp((box.top + box.height + padY) * H, H));

  const width = x1 - x0;
  const height = y1 - y0;
  if (width < MIN_CROP_PX || height < MIN_CROP_PX) return null;

  return { originX: x0, originY: y0, width, height };
}
