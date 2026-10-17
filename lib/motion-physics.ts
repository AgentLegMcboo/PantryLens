/**
 * The physics the whole app shares, from Apple's *Designing Fluid Interfaces*.
 *
 * Two ideas carry everything here:
 *
 *  1. A spring has no duration. It has a DAMPING RATIO (how much it overshoots)
 *     and a RESPONSE (how quickly it reaches the target). Those two are what a
 *     designer actually thinks in, which is why Apple replaced the physics
 *     triplet of mass/stiffness/damping with them — and why these constants are
 *     written that way rather than as stiffness numbers nobody can picture.
 *
 *  2. Motion that a finger caused must continue at the finger's velocity. The
 *     seam between dragging and animating is the single detail that separates an
 *     interface that feels fluid from one that merely feels finished.
 *
 * Reanimated 4 takes `dampingRatio` + `duration` + `velocity` directly, so these
 * map across with no translation. Note that Reanimated treats `duration` as
 * PERCEPTUAL — the real settle takes about 1.5× longer — which is the same thing
 * Apple means by response.
 */

/**
 * The default for anything that moves on its own.
 *
 * Critically damped: it arrives and stops. Overshoot on something the user did
 * not throw reads as the interface showing off.
 */
export const SPRING_SETTLE = { dampingRatio: 1, duration: 350 } as const;

/** A brief arrival for a notification that moves into view on its own. */
export const SPRING_NOTIFICATION = { ...SPRING_SETTLE, duration: 300 } as const;

/**
 * For a sheet or drawer, which the user drags and releases.
 *
 * Apple ships damping 0.8 / response 0.3 here. The slight bounce is earned: a
 * flick carried momentum, so a little overshoot is the momentum arriving.
 */
export const SPRING_SHEET = { dampingRatio: 0.82, duration: 300 } as const;

/** Repositioning something under the finger. Apple: damping 1.0 / response 0.4. */
export const SPRING_MOVE = { dampingRatio: 1, duration: 400 } as const;

/**
 * A press, which must be felt before it is seen finished.
 *
 * Fast and critically damped — a button that wobbles after a tap is a button
 * that feels loose.
 */
export const SPRING_PRESS = { dampingRatio: 1, duration: 140 } as const;

/**
 * Where a flick is going, not where it was released.
 *
 * Apple's own projection from the Designing Fluid Interfaces sample code. The
 * physics-textbook v²/(2a) is NOT what they ship: this is exponential decay,
 * the same curve scroll deceleration uses, which is why a flick here feels like
 * a flick everywhere else on the device.
 *
 * `decelerationRate` 0.998 is the normal scroll feel; 0.99 is snappier.
 */
export function projectDecay(velocity: number, decelerationRate = 0.998): number {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Progressive resistance past a boundary.
 *
 * A hard stop reads as frozen — as though the app stopped listening. Resistance
 * that grows the further you push reads as "still listening, but there is
 * nothing more this way", which is the truth.
 *
 * `overshoot` is how far past the edge the finger has gone, `dimension` the size
 * of the surface being dragged.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  'worklet';
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * Movement before a drag is believed, in px.
 *
 * Below this a touch is still a tap. Without it, a thumb that shifts two pixels
 * on the way up turns every tap into a tiny unwanted drag.
 */
export const DRAG_SLOP = 10;
