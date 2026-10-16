import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text as RNText, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import Svg, { Ellipse, Path } from "react-native-svg";
import { COLORS } from "../constants/theme";
import { cuePress, cueSuccess, cueTap } from "../lib/feedback";
import { AnimatedCounter } from "./motion";
import { Text } from "./ui";

/**
 * Onboarding you can try, not read.
 *
 * Each slide is a small working copy of one step in the app: take a picture
 * and watch the food get found, confirm each item the way Review does it, and
 * pick a family size to see how many boxes that makes. If nobody taps, the
 * demo plays itself after a short pause. When a person finishes one by hand,
 * `onDone` fires so onboarding can move on to the next slide.
 *
 * Demos lay themselves out in the `w`×`h` they are given, at real size. They
 * used to be drawn at a fixed size and scaled with a transform, which blurred
 * the art.
 */

type DemoProps = { active: boolean; w: number; h: number; onDone: () => void };

/** How long a demo waits for a tap before playing itself. */
const IDLE_MS = 6000;
const NEVER = ReduceMotion.Never;

/** Detection colours that read on any photo: hot orange edge, dark label. */
const BOX_EDGE = "#FF7A1A";
const LABEL_BG = "#1E140E";

/** Runs `fn` once after the idle pause, unless the slide is left first. */
function useAutoplay(on: boolean, fn: () => void, deps: unknown[]) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => latest.current(), IDLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, ...deps]);
}

/**
 * "Tap here", said loudly: a thick orange ring that keeps swelling out of the
 * control, and a dark "Tap" bubble bobbing beside it.
 */
function TapHint({
  on,
  radius,
  children,
  bubble = "top-right",
}: {
  on: boolean;
  radius: number;
  children: React.ReactNode;
  bubble?: "top-right" | "top-left" | "none";
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    if (on) {
      t.value = withRepeat(
        withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad), reduceMotion: NEVER }),
        -1,
        false,
        undefined,
        NEVER,
      );
    }
  }, [on, t]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.95 * (1 - t.value),
    transform: [{ scale: 1 + t.value * 0.18 }],
  }));
  const bob = useAnimatedStyle(() => ({
    transform: [{ translateY: -5 * Math.sin(t.value * Math.PI) }],
  }));
  return (
    <View>
      {children}
      {on && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: -5,
                left: -5,
                right: -5,
                bottom: -5,
                borderRadius: radius + 5,
                borderWidth: 3.5,
                borderColor: COLORS.primary,
              },
              ring,
            ]}
          />
          {bubble !== "none" && (
            <Animated.View
              pointerEvents="none"
              style={[
                { position: "absolute", top: -30 },
                bubble === "top-right" ? { right: -10 } : { left: -10 },
                bob,
              ]}
            >
              <View
                className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
                style={{ backgroundColor: LABEL_BG }}
              >
                <MaterialCommunityIcons name="gesture-tap" size={14} color="#FFFFFF" />
                <RNText style={{ fontSize: 12, lineHeight: 15, fontWeight: "800", color: "#FFFFFF" }}>
                  Tap
                </RNText>
              </View>
            </Animated.View>
          )}
        </>
      )}
    </View>
  );
}

/** Where the food sits in pantry-cabinet-full.jpg, as fractions of the photo. */
const FOUND = [
  { name: "Black beans", count: 2, category: "protein", x: 0.655, y: 0.205, w: 0.165, h: 0.09 },
  { name: "Chicken", count: 4, category: "protein", x: 0.672, y: 0.378, w: 0.09, h: 0.108 },
  { name: "Green beans", count: 4, category: "vegetable", x: 0.355, y: 0.5, w: 0.142, h: 0.158 },
  { name: "Pumpkin", count: 3, category: "vegetable", x: 0.045, y: 0.735, w: 0.26, h: 0.094 },
  { name: "Tomatoes", count: 2, category: "vegetable", x: 0.818, y: 0.742, w: 0.078, h: 0.084 },
] as const;
const PHOTO = require("../assets/images/pantry-cabinet-full.jpg");

/** One found item drawn on the photo. `dim` for the ones not being looked at. */
function FoundBox({
  item,
  imgW,
  imgH,
  dim = false,
  done = false,
  delay = 0,
}: {
  item: (typeof FOUND)[number];
  imgW: number;
  imgH: number;
  dim?: boolean;
  done?: boolean;
  delay?: number;
}) {
  const right = item.x > 0.55;
  const edge = done ? COLORS.statusGood : dim ? "rgba(255,255,255,0.85)" : BOX_EDGE;
  return (
    <Animated.View
      entering={FadeIn.delay(delay).duration(300).reduceMotion(NEVER)}
      pointerEvents="none"
      style={{
        position: "absolute",
        left: item.x * imgW,
        top: item.y * imgH,
        width: item.w * imgW,
        height: item.h * imgH,
        borderWidth: dim ? 2 : 3,
        borderRadius: 7,
        borderColor: edge,
        // A dark hairline outside the colour, so the edge holds on pale labels.
        boxShadow: "0 0 0 1px rgba(0,0,0,0.55)",
      }}
    >
      {!dim && (
        // A wide, see-through lane for the label: an absolute child is only as
        // wide as its parent, so a label inside a small box was cut to "Bla…".
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -22,
            [right ? "right" : "left"]: -3,
            width: 180,
            flexDirection: "row",
            justifyContent: right ? "flex-end" : "flex-start",
          }}
        >
        <View
          className="flex-row items-center gap-1"
          style={{
            paddingHorizontal: 7,
            paddingVertical: 2.5,
            borderRadius: 6,
            backgroundColor: LABEL_BG,
            borderWidth: 1.5,
            borderColor: edge,
          }}
        >
          {done && <MaterialCommunityIcons name="check-bold" size={11} color={COLORS.statusGood} />}
          <RNText numberOfLines={1} style={{ fontSize: 11.5, lineHeight: 14, fontWeight: "800", color: "#FFFFFF" }}>
            {item.name} ×{item.count}
          </RNText>
        </View>
        </View>
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------- 1. snap

export function SnapDemo({ active, w, h, onDone }: DemoProps) {
  const [snapped, setSnapped] = useState(false);
  const flash = useSharedValue(0);
  const phoneH = Math.min(h, w * 1.45);
  const phoneW = (phoneH * 2) / 3;

  useEffect(() => {
    if (!active) setSnapped(false);
  }, [active]);

  const snap = (byHand: boolean) => {
    cuePress();
    flash.value = withSequence(
      withTiming(1, { duration: 60, reduceMotion: NEVER }),
      withTiming(0, { duration: 420, reduceMotion: NEVER }),
    );
    setSnapped(true);
    setTimeout(cueSuccess, 1500);
    if (byHand) setTimeout(onDone, 4000);
  };
  useAutoplay(active && !snapped, () => snap(false), [snapped]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const glass = "rgba(20,16,14,0.7)";

  return (
    <View style={{ width: w, height: h }} className="items-center justify-center">
      <View
        style={{
          width: phoneW,
          height: phoneH,
          borderRadius: 30,
          overflow: "hidden",
          backgroundColor: "#111",
          boxShadow: "0 12px 36px 0 rgba(107, 74, 47, 0.28)",
        }}
      >
        <Image source={PHOTO} style={{ position: "absolute", width: phoneW, height: phoneH }} />

        {snapped &&
          FOUND.map((f, i) => (
            <FoundBox key={f.name} item={f} imgW={phoneW} imgH={phoneH} delay={500 + i * 300} />
          ))}

        <View className="absolute left-0 right-0 items-center" style={{ top: 14 }}>
          <View className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5" style={{ backgroundColor: glass }}>
            <MaterialCommunityIcons name={snapped ? "check-circle" : "camera-outline"} size={15} color="#FFFFFF" />
            <RNText style={{ fontSize: 13, lineHeight: 17, fontWeight: "700", color: "#FFFFFF" }}>
              {snapped ? "Found 5 foods" : "Take a picture"}
            </RNText>
          </View>
        </View>

        {!snapped && (
          <View className="absolute bottom-0 left-0 right-0 items-center" style={{ paddingBottom: 18 }}>
            <TapHint on={active} radius={36}>
              <Pressable
                onPress={() => snap(true)}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel="Take a picture of the shelf"
                className="h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-white"
              >
                <View className="h-[58px] w-[58px] items-center justify-center rounded-full" style={{ backgroundColor: COLORS.primary }}>
                  <MaterialCommunityIcons name="camera" size={26} color="#FFFFFF" />
                </View>
              </Pressable>
            </TapHint>
          </View>
        )}

        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFFFF" }, flashStyle]}
        />
      </View>
    </View>
  );
}

// ------------------------------------------------------------- 2. confirm

/**
 * Review, cut down to its core: the photo with one item marked, its name and
 * count, and one button. Confirm moves to the next item; after the last one
 * the same button saves. (The real screen adds a strip of items, editing and
 * a separate Save; onboarding only needs the idea.)
 */
export function ConfirmDemo({ active, w, h, onDone }: DemoProps) {
  const [confirmed, setConfirmed] = useState(0);
  const [saved, setSaved] = useState(false);
  const [auto, setAuto] = useState(false);
  const byHand = useRef(false);
  const all = confirmed >= FOUND.length;
  const item = FOUND[Math.min(confirmed, FOUND.length - 1)];

  // A smaller photo window, panned (no bounce) so the item sits in the middle.
  const cardW = Math.min(w, 380);
  // The list of items takes ~36 a row; the photo gets the rest of the height.
  const listH = FOUND.length * 36;
  const photoH = Math.max(150, h - listH - 56 - 2 * 12);
  const imgW = cardW;
  const imgH = cardW * 1.5;
  const target = Math.min(0, Math.max(photoH - imgH, photoH / 2 - (item.y + item.h / 2) * imgH));
  const pan = useSharedValue(target);
  useEffect(() => {
    pan.value = withTiming(target, { duration: 600, easing: Easing.inOut(Easing.cubic), reduceMotion: NEVER });
  }, [target, pan]);
  const panStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pan.value }] }));

  useEffect(() => {
    if (!active) {
      setConfirmed(0);
      setSaved(false);
      setAuto(false);
      byHand.current = false;
    }
  }, [active]);

  // Nobody tapping: confirm them one by one, then save.
  useAutoplay(active && !auto && confirmed === 0, () => setAuto(true), [auto, confirmed]);
  useEffect(() => {
    if (!auto || saved) return;
    const t = setTimeout(() => (all ? save() : confirm()), 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, confirmed, saved]);

  const confirm = () => {
    cueTap();
    setConfirmed((c) => Math.min(FOUND.length, c + 1));
  };
  const save = () => {
    cueSuccess();
    setSaved(true);
    if (byHand.current) setTimeout(onDone, 3000);
  };
  const press = () => {
    setAuto(false);
    byHand.current = true;
    if (all) save();
    else confirm();
  };

  const units = FOUND.reduce((sum, f) => sum + f.count, 0);

  return (
    <View style={{ width: w, height: h }} className="items-center justify-center">
      <View style={{ width: cardW }} className="gap-3">
        <View style={{ height: photoH, borderRadius: 16, overflow: "hidden", backgroundColor: "#111" }}>
          <Animated.View style={[{ width: imgW, height: imgH }, panStyle]}>
            <Image source={PHOTO} style={{ width: imgW, height: imgH }} />
            {FOUND.map((f, i) =>
              i < confirmed ? <FoundBox key={f.name} item={f} imgW={imgW} imgH={imgH} dim done /> : null,
            )}
            {!all && <FoundBox key={item.name} item={item} imgW={imgW} imgH={imgH} />}
          </Animated.View>
          <View
            className="absolute right-2 top-2 rounded-full px-2.5 py-1"
            style={{ backgroundColor: "rgba(20,16,14,0.7)" }}
          >
            <RNText style={{ fontSize: 12, lineHeight: 16, fontWeight: "700", color: "#FFFFFF" }}>
              {Math.min(confirmed + (all ? 0 : 1), FOUND.length)} of {FOUND.length}
            </RNText>
          </View>
        </View>

        {/* Every item, ticked green as it's confirmed */}
        <View>
          {FOUND.map((f, i) => {
            const done = i < confirmed;
            const on = i === confirmed;
            return (
              <View key={f.name} className="h-9 flex-row items-center gap-2.5">
                <View
                  className="h-6 w-6 items-center justify-center rounded-md"
                  style={{
                    borderWidth: 2,
                    borderColor: done ? COLORS.statusGood : on ? COLORS.primary : COLORS.borderStrong,
                    backgroundColor: done ? COLORS.statusGood : "transparent",
                  }}
                >
                  {done && (
                    <Animated.View entering={FadeIn.duration(200).reduceMotion(NEVER)}>
                      <MaterialCommunityIcons name="check-bold" size={15} color="#FFFFFF" />
                    </Animated.View>
                  )}
                </View>
                <Text variant="body" className={`flex-1 ${on ? "font-bold" : "font-semibold"}`} tone={done || on ? "default" : "soft"}>
                  {f.name}
                </Text>
                <Text variant="body" tone="soft" className="font-semibold">
                  ×{f.count}
                </Text>
              </View>
            );
          })}
        </View>

        {saved ? (
          <Animated.View
            entering={FadeIn.duration(300).reduceMotion(NEVER)}
            className="h-[56px] flex-row items-center justify-center gap-2 rounded-md"
            style={{ backgroundColor: COLORS.statusGood }}
          >
            <MaterialCommunityIcons name="check-circle" size={22} color="#FFFFFF" />
            <RNText style={{ fontSize: 16, fontWeight: "700", color: "#FFFFFF" }}>
              {units} items added to inventory
            </RNText>
          </Animated.View>
        ) : (
          <TapHint on={active} radius={8} bubble="top-right">
            <Pressable
              onPress={press}
              accessibilityRole="button"
              accessibilityLabel={all ? `Save ${units} items` : `Confirm ${item.count} ${item.name}`}
              className="h-[56px] flex-row items-center justify-center gap-2 rounded-md"
              style={{ backgroundColor: all ? COLORS.statusGood : COLORS.primary }}
            >
              <MaterialCommunityIcons name={all ? "tray-arrow-down" : "check"} size={21} color="#FFFFFF" />
              <RNText numberOfLines={1} style={{ fontSize: 16, fontWeight: "700", color: "#FFFFFF" }}>
                {all ? `Save ${units} items` : `Confirm ${item.count} ${item.name}`}
              </RNText>
            </Pressable>
          </TapHint>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- 3. pack

/**
 * Per family size, from the same demo stock: bigger families get fuller
 * boxes, so the same shelves make fewer of them.
 */
const PACK: Record<number, { items: number; boxes: number }> = {
  4: { items: 6, boxes: 12 },
  6: { items: 9, boxes: 8 },
  8: { items: 12, boxes: 6 },
};

/** A mix of groceries, so the box reads as food and not a row of pills. */
type Kind = "can" | "carton" | "jar" | "bag";
const GOODS: { kind: Kind; body: string; trim: string }[] = [
  { kind: "carton", body: "#D9932E", trim: "#F7DDB0" },
  { kind: "can", body: "#C9573E", trim: "#F2C2B4" },
  { kind: "bag", body: "#EFE3C8", trim: "#B9A783" },
  { kind: "jar", body: "#B5463A", trim: "#7A4A2A" },
  { kind: "can", body: "#5E8F4E", trim: "#CFE3C5" },
  { kind: "carton", body: "#3E8C95", trim: "#BFE2E6" },
  { kind: "jar", body: "#E0B341", trim: "#8A6E3C" },
  { kind: "can", body: "#B5577E", trim: "#F1C6D8" },
  { kind: "bag", body: "#E9D2B0", trim: "#A98A5E" },
  { kind: "carton", body: "#8B6BB0", trim: "#DCCFEA" },
  { kind: "can", body: "#3F7DB8", trim: "#C5DCF0" },
  { kind: "jar", body: "#7A9A3C", trim: "#4E6326" },
];
const SIZE: Record<Kind, { w: number; h: number }> = {
  can: { w: 24, h: 36 },
  carton: { w: 26, h: 50 },
  jar: { w: 24, h: 32 },
  bag: { w: 32, h: 44 },
};

/** One grocery item, drawn as plain views so it stays sharp at any size. */
function Good({ kind, body, trim, k }: { kind: Kind; body: string; trim: string; k: number }) {
  const { w, h } = SIZE[kind];
  const W = w * k;
  const H = h * k;
  if (kind === "jar") {
    return (
      <View style={{ width: W, height: H, alignItems: "center" }}>
        <View style={{ width: W * 0.8, height: 6 * k, backgroundColor: trim, borderRadius: 2 * k }} />
        <View style={{ width: W, flex: 1, backgroundColor: body, borderRadius: 6 * k, borderTopLeftRadius: 3 * k, borderTopRightRadius: 3 * k, justifyContent: "center", alignItems: "center" }}>
          <View style={{ width: W * 0.7, height: H * 0.32, backgroundColor: "#FFFFFF", opacity: 0.75, borderRadius: 2 * k }} />
        </View>
      </View>
    );
  }
  if (kind === "bag") {
    return (
      <View style={{ width: W, height: H, backgroundColor: body, borderRadius: 4 * k, borderTopLeftRadius: 12 * k, borderTopRightRadius: 12 * k, borderWidth: 1.5, borderColor: trim, justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: W * 0.6, height: 3 * k, backgroundColor: trim, borderRadius: 2 }} />
        <View style={{ width: W * 0.4, height: 3 * k, marginTop: 4 * k, backgroundColor: trim, borderRadius: 2 }} />
      </View>
    );
  }
  if (kind === "carton") {
    return (
      <View style={{ width: W, height: H, backgroundColor: body, borderRadius: 3 * k, overflow: "hidden" }}>
        <View style={{ height: 8 * k, backgroundColor: trim, opacity: 0.9 }} />
        <View style={{ marginTop: 8 * k, marginHorizontal: 4 * k, height: H * 0.3, backgroundColor: "#FFFFFF", opacity: 0.55, borderRadius: 2 * k }} />
      </View>
    );
  }
  return (
    <View style={{ width: W, height: H, backgroundColor: body, borderRadius: 5 * k, justifyContent: "center" }}>
      <View style={{ height: H * 0.38, backgroundColor: trim }} />
    </View>
  );
}

/** Falls from above the box and lands in its spot. */
function Falling({ delay, from, children, style }: { delay: number; from: number; children: React.ReactNode; style: object }) {
  const y = useSharedValue(-from);
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withDelay(delay, withTiming(1, { duration: 220, reduceMotion: NEVER }), NEVER);
    y.value = withDelay(
      delay,
      withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic), reduceMotion: NEVER }),
      NEVER,
    );
  }, [delay, from, o, y]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  return <Animated.View style={[{ position: "absolute" }, style, anim]}>{children}</Animated.View>;
}

/**
 * An ordinary open cardboard box, seen from the front and a little to the
 * right: a square front face, one side, and four flaps folded open. Drawn in
 * two layers so things can sit inside it: the back (back flap, left flap, the
 * dark inside) and the front (front face, side, front and right flaps).
 */
const BOX_VB = "0 0 240 185";
export function OpenBoxBack({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox={BOX_VB} style={{ position: "absolute" }}>
      <Ellipse cx="122" cy="172" rx="104" ry="9" fill="#6B4A2F" opacity="0.14" />
      <Path d="M64 58L206 58L196 26L74 26Z" fill="#E8C4A1" stroke="#B88960" strokeWidth="2" strokeLinejoin="round" />
      <Path d="M34 80L64 58L44 38L12 60Z" fill="#EECFB0" stroke="#B88960" strokeWidth="2" strokeLinejoin="round" />
      <Path d="M34 80L64 58L206 58L176 80Z" fill="#9C7351" stroke="#B88960" strokeWidth="2" strokeLinejoin="round" />
    </Svg>
  );
}
export function OpenBoxFront({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox={BOX_VB} style={{ position: "absolute" }}>
      <Path d="M34 80H176V166H34Z" fill="#D8AB80" stroke="#B88960" strokeWidth="2" strokeLinejoin="round" />
      <Path d="M176 80L206 58V144L176 166Z" fill="#C79A70" stroke="#B88960" strokeWidth="2" strokeLinejoin="round" />
      <Path d="M34 80H176L168 100H42Z" fill="#EECFB0" stroke="#B88960" strokeWidth="2" strokeLinejoin="round" />
      <Path d="M176 80L206 58L230 72L202 98Z" fill="#E8C29C" stroke="#B88960" strokeWidth="2" strokeLinejoin="round" />
      <Path d="M70 130H140" stroke="#B88960" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
    </Svg>
  );
}

/** The same box with nothing in it yet. */
export function EmptyBox({ width }: { width: number }) {
  const height = (185 * width) / 240;
  return (
    <View style={{ width, height }}>
      <OpenBoxBack width={width} height={height} />
      <OpenBoxFront width={width} height={height} />
    </View>
  );
}

/**
 * An open box that fills up: the back of the box, the groceries falling in,
 * then the front panel over their bottoms, so they land inside it.
 */
function FillingBox({ items, width, keyId }: { items: number; width: number; keyId: number }) {
  const k = width / 240;
  const height = 185 * k;
  const back = Math.floor(items / 2);
  const front = items - back;
  // Two rows inside the rim: the back row up and to the right, the front row
  // lower, both with their bottoms hidden behind the front face.
  const rows = [
    { count: back, bottom: 90, x0: 74, x1: 198 },
    { count: front, bottom: 100, x0: 42, x1: 172 },
  ];
  const placed: { x: number; bottom: number; i: number }[] = [];
  let n = 0;
  rows.forEach((row) => {
    const slot = (row.x1 - row.x0) / Math.max(1, row.count);
    for (let j = 0; j < row.count; j++) placed.push({ x: row.x0 + slot * (j + 0.5), bottom: row.bottom, i: n++ });
  });

  return (
    <View style={{ width, height }}>
      <OpenBoxBack width={width} height={height} />
      {placed.map((p) => {
        const g = GOODS[p.i % GOODS.length];
        const { w, h } = SIZE[g.kind];
        return (
          <Falling
            key={`${keyId}-${p.i}`}
            delay={p.i * 70}
            from={14}
            style={{ left: (p.x - w / 2) * k, top: (p.bottom - h) * k }}
          >
            <Good kind={g.kind} body={g.body} trim={g.trim} k={k} />
          </Falling>
        );
      })}
      <OpenBoxFront width={width} height={height} />
    </View>
  );
}

/** A small closed box, taped shut: one finished family box. */
function ClosedBox({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path d="M4 14L20 8L36 14L20 20Z" fill="#E8C29C" stroke="#B88960" strokeWidth="1.5" strokeLinejoin="round" />
      <Path d="M4 14V31L20 37V20Z" fill="#D8AB80" stroke="#B88960" strokeWidth="1.5" strokeLinejoin="round" />
      <Path d="M36 14V31L20 37V20Z" fill="#C79A70" stroke="#B88960" strokeWidth="1.5" strokeLinejoin="round" />
      <Path d="M12 11L28 17" stroke="#F3E2CC" strokeWidth="3" />
    </Svg>
  );
}

/** A quick shake every couple of seconds: "tap me", without a glowing ring. */
function Wiggle({ on, delay = 0, children }: { on: boolean; delay?: number; children: React.ReactNode }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = 0;
    if (!on) return;
    const step = (to: number, ms = 70) => withTiming(to, { duration: ms, reduceMotion: NEVER });
    r.value = withDelay(
      delay,
      withRepeat(
        withSequence(step(-3, 90), step(3, 90), step(-2, 90), step(0, 90), withDelay(2400, step(0, 1))),
        -1,
        false,
        undefined,
        NEVER,
      ),
      NEVER,
    );
  }, [on, delay, r]);
  const anim = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}

export function PackDemo({ active, w, h, onDone }: DemoProps) {
  const [family, setFamily] = useState(4);
  const [touched, setTouched] = useState(false);
  const [run, setRun] = useState(0);
  const { items, boxes } = PACK[family];

  useEffect(() => {
    if (active) setRun((r) => r + 1);
    else {
      setFamily(4);
      setTouched(false);
    }
  }, [active]);

  // Shows the numbers moving even if nobody taps.
  useAutoplay(active && !touched && family === 4, () => setFamily(6), [family, touched]);

  const pick = (size: number) => {
    cueTap();
    setFamily(size);
    if (!touched) setTimeout(onDone, 4000);
    setTouched(true);
  };

  // Portrait: one column. The open box gets whatever height is left.
  const mini = 34;
  const perRow = Math.max(1, Math.floor(w / (mini + 4)));
  const gridH = Math.ceil(12 / perRow) * (mini + 4);
  const boxW = Math.min(w * 0.82, 320, Math.max(160, ((h - 80 - 48 - gridH - 40) * 240) / 185));

  return (
    <View style={{ width: w, height: h }} className="items-center justify-center gap-3">
      <View className="w-full gap-2">
        <Text variant="body" className="text-center font-bold">
          People in each family
        </Text>
        <View className="flex-row gap-2">
          {[4, 6, 8].map((size, i) => {
            const on = family === size;
            return (
              <View key={size} className="flex-1">
                <Wiggle on={active && !touched && !on} delay={i * 120}>
                  <Pressable
                    onPress={() => pick(size)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Families of ${size}`}
                    className="h-[52px] items-center justify-center rounded-md border-2"
                    style={{
                      backgroundColor: on ? COLORS.primary : COLORS.cardSurface,
                      borderColor: on ? COLORS.primary : COLORS.borderStrong,
                    }}
                  >
                    <Text variant="title" className="font-bold" style={{ color: on ? COLORS.textOnAccent : COLORS.textPrimary }}>
                      {size}
                    </Text>
                  </Pressable>
                </Wiggle>
              </View>
            );
          })}
        </View>
      </View>

      <View className="items-center">
        <FillingBox items={items} width={boxW} keyId={family * 1000 + run} />
        <Text variant="label" tone="soft" className="-mt-1 font-semibold">
          {items} items in each box
        </Text>
      </View>

      <View className="w-full items-center gap-1.5">
        <View className="flex-row items-baseline gap-2">
          <Text variant="heading" className="font-semibold">
            You can pack
          </Text>
          <AnimatedCounter
            value={boxes}
            duration={450}
            style={{ fontSize: 36, fontWeight: "800", color: COLORS.primaryDark }}
          />
          <Text variant="heading" className="font-semibold">
            boxes
          </Text>
        </View>
        <View className="flex-row flex-wrap justify-center gap-1" style={{ minHeight: gridH }}>
          {Array.from({ length: boxes }, (_, i) => (
            <Falling key={`${family}-${run}-${i}`} delay={200 + i * 35} from={6} style={{ position: "relative" }}>
              <ClosedBox size={mini} />
            </Falling>
          ))}
        </View>
      </View>
    </View>
  );
}
