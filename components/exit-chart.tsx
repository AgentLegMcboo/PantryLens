import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS } from '../constants/theme';
import type { StockExit } from '../lib/reports';
import { Text } from './ui';

/**
 * Given out and thrown away over the chosen period, as stacked bars.
 *
 * Two totals say how much; only a shape over time says whether the pantry is
 * getting better at it, or whether last Saturday was the whole month.
 */

export const GIVEN_COLOUR = COLORS.secondary;
export const WASTED_COLOUR = '#D7B9A4';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86_400_000;

type Bucket = { start: number; end: number; label: string; given: number; wasted: number };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayLabel = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

/** Daily for a week or a month, weekly for a quarter, monthly for all time. */
function bucketsFor(exits: StockExit[], days: number): Bucket[] {
  const today = startOfDay(new Date());
  const out: Bucket[] = [];

  if (days === 7 || days === 30) {
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(today.getTime() - i * DAY);
      out.push({ start: start.getTime(), end: start.getTime() + DAY, label: dayLabel(start), given: 0, wasted: 0 });
    }
  } else if (days > 0) {
    const weeks = Math.ceil(days / 7);
    const end = today.getTime() + DAY;
    for (let i = weeks - 1; i >= 0; i--) {
      const s = end - (i + 1) * 7 * DAY;
      out.push({ start: s, end: s + 7 * DAY, label: dayLabel(new Date(s)), given: 0, wasted: 0 });
    }
  } else {
    const earliest = exits.reduce(
      (min, e) => Math.min(min, new Date(e.occurred_at).getTime()),
      Date.now(),
    );
    const first = new Date(earliest);
    let months =
      (today.getFullYear() - first.getFullYear()) * 12 + today.getMonth() - first.getMonth() + 1;
    months = Math.min(12, Math.max(6, months));
    for (let i = months - 1; i >= 0; i--) {
      const s = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const e = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
      out.push({ start: s.getTime(), end: e.getTime(), label: MONTHS[s.getMonth()], given: 0, wasted: 0 });
    }
  }

  for (const e of exits) {
    const t = new Date(e.occurred_at).getTime();
    const b = out.find((x) => t >= x.start && t < x.end);
    if (!b) continue;
    if (e.reason === 'given_out') b.given += e.count;
    if (e.reason === 'discarded') b.wasted += e.count;
  }
  return out;
}

/** 1, 2, 5, 10, 20, 50… — so the top gridline is a number people say. */
function niceCeil(n: number) {
  if (n <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= n) return m * pow;
  return 10 * pow;
}

const HEIGHT = 200;
const AXIS_W = 28;
const LABEL_H = 18;

export function ExitChart({ exits, days }: { exits: StockExit[]; days: number }) {
  const [width, setWidth] = React.useState(0);
  const buckets = React.useMemo(() => bucketsFor(exits, days), [exits, days]);

  const peak = Math.max(0, ...buckets.map((b) => b.given + b.wasted));
  const top = niceCeil(peak);
  const plotW = Math.max(0, width - AXIS_W);
  const plotH = HEIGHT - LABEL_H;
  const slot = buckets.length ? plotW / buckets.length : 0;
  const barW = Math.max(3, Math.min(22, slot * 0.62));
  const y = (v: number) => plotH - (v / top) * plotH;

  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  React.useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: reduceMotion ? 200 : 650,
      easing: Easing.bezier(0.2, 0, 0, 1),
      reduceMotion: ReduceMotion.Never,
    });
  }, [exits, days, reduceMotion, progress]);
  const grow = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: progress.value }
      : { transform: [{ scaleY: Math.max(0.001, progress.value) }] },
  );

  // Three dates along the bottom: first, middle, last. More is clutter.
  const ticks = buckets.length
    ? [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1]
    : [];

  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {[0, 0.5, 1].map((f) => (
              <React.Fragment key={f}>
                <Line
                  x1={AXIS_W}
                  x2={width}
                  y1={y(top * f)}
                  y2={y(top * f)}
                  stroke={COLORS.borderSoft}
                  strokeWidth={1}
                  strokeDasharray={f === 0 ? undefined : '3 4'}
                />
                <SvgText
                  x={AXIS_W - 6}
                  y={y(top * f) + 4}
                  fontSize={11}
                  fontWeight="600"
                  fill={COLORS.textSecondary}
                  textAnchor="end"
                >
                  {Math.round(top * f)}
                </SvgText>
              </React.Fragment>
            ))}

            {ticks.map((i, n) => {
              const cx = AXIS_W + i * slot + slot / 2;
              return (
                <SvgText
                  key={`${i}-${n}`}
                  x={n === 0 ? cx - barW / 2 : n === 2 ? cx + barW / 2 : cx}
                  y={HEIGHT - 3}
                  fontSize={11}
                  fontWeight="600"
                  fill={COLORS.textSecondary}
                  textAnchor={n === 0 ? 'start' : n === 2 ? 'end' : 'middle'}
                >
                  {buckets[i].label}
                </SvgText>
              );
            })}
          </Svg>
        )}
        {/* The bars on their own layer, so they can grow up from the
            baseline when the chart appears or the period changes — the axis
            and labels stay put. With reduced motion they fade in instead. */}
        {width > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', top: 0, left: 0, width, height: plotH, transformOrigin: 'bottom' },
              grow,
            ]}
          >
            <Svg width={width} height={plotH}>
                {buckets.map((b, i) => {
                  const x = AXIS_W + i * slot + (slot - barW) / 2;
                  const r = Math.min(4, barW / 2);
                  const givenTop = y(b.given);
                  const wastedTop = y(b.given + b.wasted);
                  return (
                    <React.Fragment key={b.start}>
                      {b.wasted > 0 && (
                        <Rect
                          x={x}
                          y={wastedTop}
                          width={barW}
                          height={plotH - wastedTop}
                          rx={r}
                          fill={WASTED_COLOUR}
                        />
                      )}
                      {b.given > 0 && (
                        <Rect
                          x={x}
                          y={givenTop}
                          width={barW}
                          height={plotH - givenTop}
                          rx={r}
                          fill={GIVEN_COLOUR}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
            </Svg>
          </Animated.View>
        )}
      </View>

      <View className="mt-3 flex-row gap-4">
        <Legend colour={GIVEN_COLOUR} label="Given out" />
        <Legend colour={WASTED_COLOUR} label="Thrown away" />
      </View>
    </View>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colour }} />
      <Text variant="label" tone="soft" className="font-semibold">
        {label}
      </Text>
    </View>
  );
}
