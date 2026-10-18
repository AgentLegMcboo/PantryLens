import { ResponsiveRow } from "../components/ui/responsive-row";
import { useAppAppearance } from "../lib/appearance";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { COLORS, RULE_ABOVE, RULE_BELOW, fw } from "../constants/theme";
import {
  ExitChart,
  GIVEN_COLOUR,
  WASTED_COLOUR,
} from "../components/exit-chart";
import { AnimatedCounter, FadeInUp, Tappable } from "../components/motion";
import { categoryIcon } from "../components/ui/category-icon";
import {
  Button,
  Card,
  Input,
  Row,
  Screen,
  Segmented,
  Sheet,
  Text,
} from "../components/ui";
import { timeAgo } from "../lib/time";
import { partnerReportCsv, reportingMonth } from "../lib/partner-report";
import { todayISO } from "../lib/expiry";
import { cueTap } from "../lib/feedback";
import {
  bulkLotsCsv,
  exitsCsv,
  fetchExits,
  fetchSlowMovers,
  inventoryCsv,
  shareCsv,
  slowMoversCsv,
  type SlowMover,
  type StockExit,
} from "../lib/reports";
import { usePantryStore } from "../lib/store";

/**
 * What the pantry did, in the two numbers anybody asks for.
 *
 * A food bank or a grant officer wants to know how much food reached households
 * and how much was thrown away. The app has been collecting both since exits got
 * a reason attached; this is the first place either has been readable.
 *
 * It is also the honest answer to "MESA already uses spreadsheets". A prettier
 * inventory screen does not replace a spreadsheet — being able to hand somebody
 * the numbers does.
 */
const PERIODS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 0, label: "All time" },
] as const;

const sinceFor = (days: number): string | null => {
  if (days === 0) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

export default function ReportsScreen() {
  useAppAppearance((state) => state.scheme);
  const { inventory, bulkLots, locations, settings, readyBoxes, activities } =
    usePantryStore();

  // Packed but not collected. Not "given out" yet, and worth saying so, or a
  // pantry that packed ahead of distribution day reads its numbers as a drop.
  const waitingBoxes = readyBoxes.reduce(
    (sum, r) => sum + (r.boxes - r.boxes_collected),
    0,
  );
  const waitingUnits = readyBoxes.reduce(
    (sum, r) =>
      sum +
      Math.round(
        (r.units_taken * (r.boxes - r.boxes_collected)) / Math.max(1, r.boxes),
      ),
    0,
  );

  const [days, setDays] = useState<number>(30);
  const [exits, setExits] = useState<StockExit[]>([]);
  const [slow, setSlow] = useState<SlowMover[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reportMonth, setReportMonth] = useState(todayISO().slice(0, 7));
  const [reportError, setReportError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!settings.pantryId) return;

    setLoading(true);
    setReportError(null);
    fetchExits(settings.pantryId, sinceFor(days))
      .then((rows) => !cancelled && setExits(rows))
      .catch(() => {
        if (!cancelled) {
          setExits([]);
          setReportError(
            "Could not load the exit log. Totals are unavailable; please reopen Reports to retry.",
          );
        }
      })
      .finally(() => !cancelled && setLoading(false));

    // Not windowed by `days`: "this has been sitting for four months" is a fact
    // about the shelf now, not about a reporting period.
    fetchSlowMovers(settings.pantryId)
      .then((rows) => !cancelled && setSlow(rows))
      .catch(() => !cancelled && setSlow([]));

    return () => {
      cancelled = true;
    };
  }, [settings.pantryId, days]);

  const givenOut = exits.filter((e) => e.reason === "given_out");
  const discarded = exits.filter((e) => e.reason === "discarded");
  const units = (rows: StockExit[]) =>
    rows.reduce((sum, e) => sum + e.count, 0);

  const givenUnits = units(givenOut);
  const wastedUnits = units(discarded);
  const movedUnits = givenUnits + wastedUnits;

  /** Given out as a share of everything that left, waste included. */
  const rescuedPct =
    movedUnits > 0 ? Math.round((givenUnits / movedUnits) * 100) : null;

  // What arrived in the same window, so the two sides can be compared.
  const since = sinceFor(days);
  const receivedUnits = inventory
    .filter(
      (i) =>
        !since || new Date(`${i.date_added}T00:00:00`).toISOString() >= since,
    )
    .reduce((sum, i) => sum + i.count, 0);
  const receivedLbs = bulkLots
    .filter(
      (l) =>
        !since || new Date(`${l.date_added}T00:00:00`).toISOString() >= since,
    )
    .reduce((sum, l) => sum + l.weight_lbs, 0);

  const byCategory = Object.entries(
    exits.reduce<Record<string, { given: number; wasted: number }>>(
      (acc, e) => {
        acc[e.category] ??= { given: 0, wasted: 0 };
        if (e.reason === "given_out") acc[e.category].given += e.count;
        if (e.reason === "discarded") acc[e.category].wasted += e.count;
        return acc;
      },
      {},
    ),
  )
    .filter(([, v]) => v.given + v.wasted > 0)
    .sort((a, b) => b[1].given + b[1].wasted - (a[1].given + a[1].wasted));

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (settings.pantryName || "pantry")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  const exportCsv = async (name: string, csv: string) => {
    setExportError(null);
    setBusy(true);
    try {
      cueTap();
      await shareCsv(name, csv);
    } catch (err: any) {
      setExportError(err?.message ?? "Could not export. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const maxCategory = Math.max(
    1,
    ...byCategory.map(([, v]) => v.given + v.wasted),
  );
  const shownCategories = showAllCategories
    ? byCategory
    : byCategory.slice(0, 5);

  const exports: {
    key: string;
    label: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    disabled: boolean;
    run: () => void;
  }[] = [
    {
      key: "shelf",
      label: "Current shelf",
      icon: "warehouse",
      disabled: false,
      run: () =>
        exportCsv(
          `${slug}-inventory-${stamp}.csv`,
          inventoryCsv(inventory, locations),
        ),
    },
    {
      key: "exits",
      label: "Left the shelf",
      icon: "tray-arrow-up",
      disabled: exits.length === 0,
      run: () => exportCsv(`${slug}-exits-${stamp}.csv`, exitsCsv(exits)),
    },
    {
      key: "bulk",
      label: "Bulk donations",
      icon: "scale",
      disabled: bulkLots.length === 0,
      run: () =>
        exportCsv(`${slug}-bulk-lots-${stamp}.csv`, bulkLotsCsv(bulkLots)),
    },
    {
      key: "slow",
      label: "Not moving",
      icon: "timer-sand",
      disabled: slow.length === 0,
      run: () =>
        exportCsv(`${slug}-slow-movers-${stamp}.csv`, slowMoversCsv(slow)),
    },
  ];

  return (
    <>
      <Screen>
        <Card className="py-0">
          <Row
            icon="history"
            label="Recent activity"
            hint="Scans, shelf counts, packing and other pantry updates"
            divider={false}
            onPress={() => setActivityOpen(true)}
          />
        </Card>
        {reportError && (
          <Text variant="body" tone="critical">
            {reportError}
          </Text>
        )}
        <FadeInUp index={0}>
          <Segmented
            value={days}
            options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
            onChange={setDays}
          />
        </FadeInUp>

        {/* The chart is the page: how much went out, and whether it is going
          up or down. The two totals sit on top of it as its headline. */}
        <FadeInUp index={1}>
          <Card className="p-4">
            <ResponsiveRow className="flex-row items-end justify-between gap-3">
              <View>
                <Text variant="label" tone="soft" className="font-semibold">
                  Given out
                </Text>
                <View className="flex-row items-baseline gap-1.5">
                  <AnimatedCounter
                    value={givenUnits}
                    style={{
                      fontSize: 40,
                      lineHeight: 46,
                      fontWeight: fw("800"),
                      color: COLORS.textPrimary,
                      letterSpacing: -1,
                    }}
                  />
                  <Text variant="body" tone="soft" className="font-semibold">
                    units
                  </Text>
                </View>
              </View>
              <View className="items-end pb-1.5">
                <Text variant="heading" className="font-bold">
                  {wastedUnits}{" "}
                  <Text variant="label" tone="soft" className="font-semibold">
                    thrown away
                  </Text>
                </Text>
                {rescuedPct !== null && (
                  <Text
                    variant="label"
                    className="font-bold text-secondary-dark"
                  >
                    {rescuedPct}% reached a household
                  </Text>
                )}
              </View>
            </ResponsiveRow>

            <View className="mt-4">
              {!loading && exits.length === 0 ? (
                <View className="items-center gap-2 rounded-md bg-subtle px-4 py-8">
                  <MaterialCommunityIcons
                    name="chart-bar"
                    size={28}
                    color={COLORS.textSecondary}
                  />
                  <Text
                    variant="label"
                    tone="soft"
                    className="text-center font-semibold"
                  >
                    Nothing has left the shelf in this period. Use &apos;Take
                    off shelf&apos; in Inventory and the chart fills in.
                  </Text>
                </View>
              ) : (
                <ExitChart exits={exits} days={days} />
              )}
            </View>

            {waitingBoxes > 0 && (
              <View
                className="mt-4 flex-row items-center gap-2 pt-3"
                style={RULE_ABOVE}
              >
                <MaterialCommunityIcons
                  name="package-variant-closed"
                  size={16}
                  color={COLORS.secondaryDark}
                />
                <Text variant="label" tone="soft" className="flex-1">
                  <Text variant="label" className="font-bold">
                    {waitingBoxes} {waitingBoxes === 1 ? "box" : "boxes"}
                  </Text>{" "}
                  (~{waitingUnits} units) packed, not counted until picked up
                </Text>
              </View>
            )}
          </Card>
        </FadeInUp>

        <FadeInUp index={2}>
          <ResponsiveRow className="flex-row gap-3">
            <Stat
              icon="tray-arrow-down"
              value={receivedUnits}
              unit="units"
              label="Recent stock left"
            />
            <Stat
              icon="scale"
              value={Math.round(receivedLbs)}
              unit="lb"
              label="Bulk weight logged"
            />
          </ResponsiveRow>
          <Text variant="micro" tone="soft" className="mt-2">
            Recent stock counts only units still on the shelf from this period.
            It is not a complete intake total; logged bulk weight does not
            measure distributed pounds.
          </Text>
        </FadeInUp>

        {exits.length > 0 && (
          <>
            {byCategory.length > 0 && (
              <FadeInUp index={4}>
                <Card>
                  <SectionTitle title="By category" />
                  <View className="gap-3.5">
                    {shownCategories.map(([category, v]) => (
                      <View key={category} className="gap-1.5">
                        <View className="flex-row items-center gap-2">
                          <MaterialCommunityIcons
                            name={categoryIcon(category)}
                            size={18}
                            color={COLORS.secondaryDark}
                          />
                          <Text
                            variant="body"
                            className="flex-1 font-semibold capitalize"
                          >
                            {category}
                          </Text>
                          <Text variant="label" className="font-bold">
                            {v.given}
                          </Text>
                          {v.wasted > 0 && (
                            <Text
                              variant="label"
                              tone="soft"
                              className="font-semibold"
                            >
                              · {v.wasted} wasted
                            </Text>
                          )}
                        </View>
                        <View className="h-2 flex-row overflow-hidden rounded-full bg-subtle">
                          <View
                            style={{
                              width: `${(v.given / maxCategory) * 100}%`,
                              backgroundColor: GIVEN_COLOUR,
                            }}
                          />
                          <View
                            style={{
                              width: `${(v.wasted / maxCategory) * 100}%`,
                              backgroundColor: WASTED_COLOUR,
                            }}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                  {byCategory.length > 5 && (
                    <Tappable
                      onPress={() => setShowAllCategories((open) => !open)}
                      className="mt-3 self-start py-1"
                    >
                      <Text variant="label" tone="brand" className="font-bold">
                        {showAllCategories
                          ? "Show fewer"
                          : `Show all ${byCategory.length}`}
                      </Text>
                    </Tappable>
                  )}
                </Card>
              </FadeInUp>
            )}
          </>
        )}

        {/* What nobody is taking — the number a pantry needs before it can ask a
          donor to send something else. */}
        {slow.length > 0 && (
          <FadeInUp index={5}>
            <Card>
              <SectionTitle
                title="Sitting the longest"
                hint="Ask donors for something else"
              />
              {slow.slice(0, 5).map((row, i, shown) => (
                <View
                  key={row.name}
                  className="flex-row items-center gap-3 py-2.5"
                  style={i < shown.length - 1 ? RULE_BELOW : undefined}
                >
                  <View className="flex-1">
                    <Text
                      variant="body"
                      className="font-semibold"
                      numberOfLines={1}
                    >
                      {row.name}
                    </Text>
                    <Text variant="label" tone="soft">
                      {row.units_on_shelf} on shelf
                      {row.units_given_out > 0
                        ? ` · ${row.units_given_out} given`
                        : " · never given"}
                      {row.units_discarded > 0
                        ? ` · ${row.units_discarded} binned`
                        : ""}
                    </Text>
                  </View>
                  {row.days_on_shelf !== null && (
                    <Text
                      variant="heading"
                      className="font-bold"
                      style={{
                        color:
                          row.days_on_shelf >= 60
                            ? COLORS.statusCritical
                            : COLORS.textPrimary,
                      }}
                    >
                      {row.days_on_shelf}d
                    </Text>
                  )}
                </View>
              ))}
            </Card>
          </FadeInUp>
        )}

        <Card className="gap-3">
          <Text variant="heading" className="font-bold">
            Food bank reporting
          </Text>
          <Text variant="body" tone="soft">
            Review a monthly summary, then share the CSV with your food bank.
          </Text>
          <Input
            label="Reporting month"
            value={reportMonth}
            onChangeText={setReportMonth}
            placeholder="YYYY-MM"
            error={
              reportingMonth(reportMonth)
                ? null
                : "Use YYYY-MM, for example 2026-10."
            }
          />
          <Text variant="label" tone="soft">
            Includes recorded distribution, waste and corrections. Missing
            weight and household data stay blank. Nothing is sent automatically.
          </Text>
          <Button
            label="Download monthly report"
            block
            loading={busy}
            disabled={!reportingMonth(reportMonth) || !settings.pantryId}
            onPress={async () => {
              const window = reportingMonth(reportMonth);
              if (!window || !settings.pantryId || busy) return;
              setBusy(true);
              setExportError(null);
              try {
                const rows = await fetchExits(
                  settings.pantryId,
                  window.start,
                  window.end,
                );
                await shareCsv(
                  `${slug}-partner-report-${reportMonth}.csv`,
                  partnerReportCsv(
                    settings.pantryName || "Pantry",
                    reportMonth,
                    rows,
                    inventory,
                    new Date().toISOString(),
                  ),
                );
              } catch (error: any) {
                setExportError(
                  error?.message ||
                    "Could not prepare the report. Check your connection and try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </Card>

        {exportError && (
          <Text variant="label" tone="critical" accessibilityRole="alert">
            {exportError}
          </Text>
        )}

        {/* The spreadsheet bridge: whoever the pantry reports to still wants a
          sheet. Four small tiles, not four full-width buttons. */}
        <FadeInUp index={6}>
          <Card>
            <SectionTitle title="Export CSV" />
            <View className="gap-3">
              {exports.map((x) => {
                const off = busy || x.disabled;
                return (
                  <Tappable
                    key={x.key}
                    onPress={off ? undefined : x.run}
                    disabled={off}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: off }}
                    className="min-h-[48px] flex-row items-center gap-3 rounded-md bg-subtle px-3 py-3"
                    style={{ opacity: off ? 0.4 : 1 }}
                  >
                    <MaterialCommunityIcons
                      name={x.icon}
                      size={18}
                      color={COLORS.primary}
                    />
                    <Text variant="label" className="flex-1 font-bold">
                      {x.label}
                    </Text>
                  </Tappable>
                );
              })}
            </View>
          </Card>
        </FadeInUp>
      </Screen>
      <Sheet
        visible={activityOpen}
        onClose={() => setActivityOpen(false)}
        title="Recent activity"
      >
        {activities.length === 0 ? (
          <Text tone="soft">
            Activity appears here as your team adds food, checks shelves, and
            packs boxes.
          </Text>
        ) : (
          activities.map((activity, index) => (
            <View
              key={activity.id || index}
              className="gap-1 py-3"
              style={index < activities.length - 1 ? RULE_BELOW : undefined}
            >
              <Text>{activity.text}</Text>
              <Text variant="micro" tone="soft">
                {timeAgo(activity.time)}
              </Text>
            </View>
          ))
        )}
      </Sheet>
    </>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <ResponsiveRow className="mb-3 flex-row items-baseline justify-between gap-3">
      <Text variant="heading" className="font-bold">
        {title}
      </Text>
      {hint ? (
        <Text variant="label" tone="soft" className="flex-shrink">
          {hint}
        </Text>
      ) : null}
    </ResponsiveRow>
  );
}

function Stat({
  icon,
  value,
  unit,
  label,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: number;
  unit: string;
  label: string;
}) {
  return (
    <Card className="flex-1 flex-row items-center gap-3 p-4">
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-secondary-tint">
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={COLORS.secondaryDark}
        />
      </View>
      <View className="flex-1">
        <ResponsiveRow className="flex-row items-baseline gap-1">
          <Text variant="heading" className="font-bold">
            {value}
          </Text>
          <Text variant="label" tone="soft" className="font-semibold">
            {unit}
          </Text>
        </ResponsiveRow>
        <Text variant="label" tone="soft" className="font-semibold">
          {label}
        </Text>
      </View>
    </Card>
  );
}
