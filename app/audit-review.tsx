import { ResponsiveRow } from '../components/ui/responsive-row';
import { useAppAppearance } from '../lib/appearance';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { COLORS, RULE_BELOW } from '../constants/theme';
import { FadeInUp } from '../components/motion';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  ItemThumb,
  Panel,
  Screen,
  Stepper,
  Text,
} from '../components/ui';
import {
  LOW_CONFIDENCE,
  normaliseName,
  planWrites,
  reconcile,
  statusOf,
  summarise,
  type AuditLine,
  type AuditStatus,
} from '../lib/audit';
import { finishScan } from '../lib/scan-history';
import { cueSuccess, cueWarn } from '../lib/feedback';
import { log } from '../lib/log';
import { usePantryStore } from '../lib/store';

/**
 * What the shelf says versus what you counted.
 *
 * This screen is the difference between an audit and a delivery, and it did not
 * exist: counted shelves went to Review & Verify, the intake screen, which
 * inserts. So the app's way of correcting inventory was to add more of it.
 *
 * The list here starts from WHAT THE BOOKS SAY, not from what the camera saw.
 * That inversion is the whole feature — a tin that has quietly disappeared can
 * only be noticed by a process that goes looking for it, and a list built from
 * the photos has no way to miss something that is already missing.
 *
 * The rule the rest of the screen follows: nothing is removed because the
 * camera stayed silent about it. Cans hide behind other cans, a photo comes out
 * blurred, one shot of three fails. Every unseen line is a question with a
 * default of "leave it alone".
 */

const STATUS_LABEL: Record<AuditStatus, string> = {
  missing: 'Not seen',
  new: 'Not on the books',
  corrected: 'Different',
  unchanged: 'Matches',
};

const STATUS_TONE: Record<AuditStatus, 'critical' | 'warn' | 'good' | 'neutral'> = {
  missing: 'critical',
  new: 'warn',
  corrected: 'warn',
  unchanged: 'good',
};

const SECTION_TITLE: Record<AuditStatus, string> = {
  missing: 'Needs a decision',
  new: 'Found on the shelf',
  corrected: 'Different from the books',
  unchanged: 'Matches the books',
};

const SECTION_BLURB: Record<AuditStatus, string> = {
  missing:
    'On the books, not in your count. Leave it alone unless you looked and it really is gone.',
  new: 'In your count, not on the books. These get added to this shelf.',
  corrected: 'A different number is there. The count wins.',
  unchanged: 'Nothing to do.',
};

export default function AuditReviewScreen() {
  useAppAppearance(state => state.scheme);
  const router = useRouter();
  const { auditDraft, locations, inventory, applyShelfAudit, setAuditDraft, currentScan, setCurrentScan } =
    usePantryStore();

  const place = locations.find(l => l.id === auditDraft?.locationId) ?? null;

  // Snapshotted once. The count was taken against the shelf as it stood, and
  // every line carries the number it was reconciled against — the server
  // refuses any line whose row has moved since, rather than writing over
  // somebody else's donation.
  const initial = useMemo(
    () =>
      auditDraft
        ? reconcile(
            inventory.filter(i => i.location_id === auditDraft.locationId),
            auditDraft.counted,
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auditDraft?.locationId],
  );

  const [lines, setLines] = useState<AuditLine[]>(initial);
  const [saving, setSaving] = useState(false);

  const summary = summarise(lines);
  const writes = planWrites(lines);
  const net = summary.unitsAfter - summary.unitsBefore;
  const undecided = lines.filter(l => statusOf(l) === 'missing' && !l.confirmedGone).length;

  const edit = (key: string, patch: Partial<AuditLine>) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));

  if (!auditDraft || !place) {
    return (
      <Screen>
        <EmptyState
          icon="clipboard-search-outline"
          title="No stock check in progress"
          body="Start from Audit a shelf, take your photos, and the count lands here."
          actionLabel="Check shelf inventory"
          actionVariant="primary"
          onAction={() => router.replace('/shelf-audit')}
        />
      </Screen>
    );
  }

  const finish = () => {
    setAuditDraft(null);
    setCurrentScan(null);
    router.replace('/(tabs)/inventory');
  };

  /**
   * Closes the scan record behind a count.
   *
   * A count is reconciled by NAME, so there is no one-to-one line between a
   * candidate and a row the way an intake has. What can still be said honestly
   * is whether the volunteer left the camera's number alone: the verdict is
   * 'accepted' when the line still holds exactly what the scan put there, and
   * 'edited' when a human moved it. `item_id` stays null — an audit corrects
   * rows that already existed rather than creating one per candidate.
   */
  const closeScanRecord = () => {
    if (!currentScan || !auditDraft) return;

    // What the camera alone said for each line, before any editing.
    const scanned = new Map<string, number>();
    for (const row of auditDraft.counted) {
      const key = normaliseName(row.name);
      scanned.set(key, (scanned.get(key) ?? 0) + Math.max(0, Math.round(row.count) || 0));
    }

    void finishScan(
      currentScan.scanId,
      auditDraft.counted.flatMap((row, index) => {
        const id = currentScan.itemIds[index];
        if (!id) return [];
        const key = normaliseName(row.name);
        const line = lines.find(l => l.key === key);
        const untouched = !!line && line.counted === scanned.get(key);
        return [{
          id,
          verdict: untouched ? ('accepted' as const) : ('edited' as const),
          item_id: null,
          name: line?.name ?? row.name,
          category: String(line?.category ?? row.category ?? 'unknown'),
          count: line?.counted ?? 0,
          expiration: line?.expiration ?? null,
        }];
      }),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await applyShelfAudit(place.id, auditDraft.photos, writes);
      log.debug('store', `audit applied to ${result.location_name}`, result);
      closeScanRecord();

      const moved = result.units_after - result.units_before;
      const body = [
        moved === 0
          ? 'The books were already right.'
          : `${place.name} now holds ${result.units_after} unit${
              result.units_after === 1 ? '' : 's'
            }, ${Math.abs(moved)} ${moved > 0 ? 'more' : 'fewer'} than before.`,
        result.corrected ? `${result.corrected} corrected.` : '',
        result.removed ? `${result.removed} removed.` : '',
        result.added ? `${result.added} added.` : '',
      ]
        .filter(Boolean)
        .join(' ');

      // A skipped line is not a failure, it is the one case where being told
      // matters most: somebody changed that row while the count was open, so
      // the volunteer has to look at it again rather than assume it landed.
      if (result.skipped > 0) {
        cueWarn();
        const which = result.conflicts
          .map(c =>
            c.reason === 'gone'
              ? `• ${c.name} — removed by someone else`
              : `• ${c.name} — someone changed it to ${c.actual} while you were counting`,
          )
          .join('\n');
        Alert.alert(
          `Saved, but ${result.skipped} line${result.skipped === 1 ? '' : 's'} skipped`,
          `${body}\n\nThese were left as they are:\n${which}\n\nCount them again when you get a moment.`,
          [{ text: 'Done', onPress: finish }],
        );
        return;
      }

      cueSuccess();
      Alert.alert(`${place.name} counted`, body, [{ text: 'Done', onPress: finish }]);
    } catch (err: any) {
      cueWarn();
      Alert.alert('Could not save the count', err?.message ?? 'Nothing was changed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmSave = () => {
    if (writes.length === 0) {
      Alert.alert(
        'Nothing to change',
        `Your count matches what the books say about ${place.name}. That is the result you want — saving it records that the shelf was checked.`,
        [
          { text: 'Back', style: 'cancel' },
          { text: 'Record the check', onPress: save },
        ],
      );
      return;
    }

    const removing = lines.filter(l => statusOf(l) === 'missing' && l.confirmedGone);
    const removedUnits = removing.reduce((sum, l) => sum + l.expected, 0);

    Alert.alert(
      `Save this count of ${place.name}?`,
      [
        summary.corrected > 0 ? `${summary.corrected} count${summary.corrected === 1 ? '' : 's'} corrected.` : '',
        removing.length > 0
          ? `${removing.length} item${removing.length === 1 ? '' : 's'} (${removedUnits} unit${
              removedUnits === 1 ? '' : 's'
            }) removed from the shelf and recorded as a correction.`
          : '',
        summary.added > 0 ? `${summary.added} new item${summary.added === 1 ? '' : 's'} added.` : '',
        undecided > 0
          ? `${undecided} unseen item${undecided === 1 ? '' : 's'} left exactly as ${
              undecided === 1 ? 'it is' : 'they are'
            }.`
          : '',
        'Nothing on any other shelf is affected.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      [
        { text: 'Keep checking', style: 'cancel' },
        { text: 'Save the count', onPress: save },
      ],
    );
  };

  const sections: AuditStatus[] = ['missing', 'corrected', 'new', 'unchanged'];

  return (
    <Screen contentContainerClassName="pb-36">
      <FadeInUp index={0}>
        <View className="px-1">
          <Text variant="headline">{place.name}</Text>
          <Text variant="body" tone="soft" className="mt-1">
            The books say {summary.unitsBefore} unit{summary.unitsBefore === 1 ? '' : 's'}. Your
            count says {summary.unitsAfter}.
          </Text>
        </View>
      </FadeInUp>

      <FadeInUp index={1}>
        <Card className="gap-3">
          <View className="flex-row items-center gap-3">
            <View
              className="h-12 w-1.5 rounded-sm"
              style={{
                backgroundColor:
                  net === 0 ? COLORS.statusGood : net < 0 ? COLORS.statusCritical : COLORS.statusWarning,
              }}
            />
            <View className="flex-1">
              <Text variant="heading" className="font-bold">
                {net === 0 ? 'No difference' : `${net > 0 ? '+' : ''}${net} units`}
              </Text>
              <Text variant="micro" tone="soft" className="mt-0.5">
                {net === 0
                  ? 'Your count agrees with the books.'
                  : net < 0
                    ? 'The shelf holds less than recorded — the usual reason is stock that left without being logged.'
                    : 'The shelf holds more than recorded — usually a delivery shelved without being scanned.'}
              </Text>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-2">
            {summary.corrected > 0 && <Badge label={`${summary.corrected} different`} tone="warn" />}
            {summary.missing > 0 && <Badge label={`${summary.missing} not seen`} tone="critical" />}
            {summary.added > 0 && <Badge label={`${summary.added} new`} tone="warn" />}
            {summary.unchanged > 0 && <Badge label={`${summary.unchanged} match`} tone="good" />}
          </View>
        </Card>
      </FadeInUp>

      {/* Said before the list rather than after it, because by the time someone
          has scrolled to the button they have already decided. */}
      <FadeInUp index={2}>
        <Panel className="gap-3">
          {auditDraft.photos === 0 && (
            <View className="flex-row gap-3">
              <MaterialCommunityIcons name="pencil-outline" size={18} color={COLORS.textSecondary} />
              <Text variant="micro" tone="soft" className="flex-1">
                No photos in this count, so every line starts at zero. Type in what is actually
                there; anything you leave at zero stays on the shelf untouched.
              </Text>
            </View>
          )}

          {summary.missing > 0 && (
            <View className="flex-row gap-3">
              <MaterialCommunityIcons name="eye-off-outline" size={18} color={COLORS.statusCritical} />
              <Text variant="micro" tone="soft" className="flex-1">
                <Text variant="micro" className="font-bold">
                  {summary.missing} item{summary.missing === 1 ? '' : 's'} on the books did not show
                  up in this count.
                </Text>{' '}
                That usually means the camera could not see {summary.missing === 1 ? 'it' : 'them'} —
                behind the front row, or outside the photos — not that{' '}
                {summary.missing === 1 ? 'it has' : 'they have'} gone. Look at the shelf before
                marking anything gone.
              </Text>
            </View>
          )}

          {summary.lowConfidence > 0 && (
            <View className="flex-row gap-3">
              <MaterialCommunityIcons name="alert-outline" size={18} color={COLORS.statusWarning} />
              <Text variant="micro" tone="soft" className="flex-1">
                {summary.lowConfidence} count{summary.lowConfidence === 1 ? ' was' : 's were'} read
                with low confidence — marked below. Check {summary.lowConfidence === 1 ? 'it' : 'them'}{' '}
                by eye.
              </Text>
            </View>
          )}

          <View className="flex-row gap-3">
            <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.textSecondary} />
            <Text variant="micro" tone="soft" className="flex-1">
              Nothing is saved until you press the button at the bottom, and only this shelf is
              touched. Stock removed by a count is recorded as a correction, never as given out, so
              it cannot inflate the numbers you report.
            </Text>
          </View>
        </Panel>
      </FadeInUp>

      {sections.map((section, sectionIndex) => {
        const group = lines.filter(l => statusOf(l) === section);
        if (group.length === 0) return null;

        return (
          <FadeInUp key={section} index={3 + sectionIndex}>
            <Card>
              <CardHeader title={SECTION_TITLE[section]} subtitle={SECTION_BLURB[section]} />

              {group.map((line, i) => {
                const status = statusOf(line);
                const unsure =
                  line.confidence !== undefined && line.confidence < LOW_CONFIDENCE;

                return (
                  <View
                    key={line.key}
                    className="gap-3 py-3"
                    style={i < group.length - 1 ? RULE_BELOW : undefined}
                  >
                    <ResponsiveRow className="flex-row items-center gap-3">
                      <ItemThumb
                        imageUrl={line.imageUrl}
                        category={line.category}
                        tone={status === 'missing' ? 'critical' : 'secondary'}
                      />

                      <View className="flex-1">
                        <Text variant="body" className="font-semibold">
                          {line.name}
                        </Text>
                        <Text variant="micro" tone="soft" className="mt-0.5 capitalize">
                          {status === 'new'
                            ? `${line.category} · not recorded here before`
                            : `${line.category} · books say ${line.expected}`}
                          {unsure ? ' · unsure' : ''}
                        </Text>
                      </View>

                      <Badge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
                    </ResponsiveRow>

                    <View className="flex-row items-center gap-3">
                      <Text variant="label" tone="soft" className="flex-1 font-semibold">
                        Counted on the shelf
                      </Text>
                      <Stepper
                        value={line.counted}
                        min={0}
                        onChange={next => edit(line.key, { counted: next })}
                      />
                    </View>

                    {/* The safety question. Two explicit answers and no default
                        that deletes anything — a tap is required to remove. */}
                    {status !== 'missing' && <Text variant="label" tone="brand" className="font-bold">
                      Recorded {line.expected} → Counted {line.counted} → Change {line.counted - line.expected > 0 ? '+' : ''}{line.counted - line.expected}
                    </Text>}
                    {status === 'missing' && (
                      <View className="gap-2 rounded-md bg-subtle p-3">
                        <Text variant="micro" tone="soft">
                          You had {line.expected} of these. The count did not find{' '}
                          {line.expected === 1 ? 'it' : 'any'}. Did you look?
                        </Text>
                        <ResponsiveRow className="flex-row gap-2">
                          <Chip
                            label="Still on the shelf"
                            selected={!line.confirmedGone}
                            onPress={() => edit(line.key, { confirmedGone: false })}
                          />
                          <Chip
                            label="It's gone"
                            selected={!!line.confirmedGone}
                            onPress={() => edit(line.key, { confirmedGone: true })}
                          />
                        </ResponsiveRow>
                        <Text variant="micro" tone="soft">
                          {line.confirmedGone
                            ? `All ${line.expected} will be removed and recorded as a correction.`
                            : 'Left exactly as it is. Nothing will be removed.'}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
          </FadeInUp>
        );
      })}

      <FadeInUp index={8}>
        <View className="gap-3">
          <Button
            label={saving ? 'Saving the count…' : `Save this count of ${place.name}`}
            block
            loading={saving}
            icon={
              <MaterialCommunityIcons
                name="clipboard-check-outline"
                size={20}
                color={COLORS.textOnPrimary}
              />
            }
            onPress={confirmSave}
          />
          <Text variant="micro" tone="soft" className="text-center">
            {writes.length === 0
              ? 'Nothing will change — your count matches the books.'
              : `${writes.length} change${writes.length === 1 ? '' : 's'} to ${place.name}.` +
                (undecided > 0
                  ? ` ${undecided} unseen item${undecided === 1 ? '' : 's'} left alone.`
                  : '')}
          </Text>
          <Button
            label="Discard this count"
            variant="criticalGhost"
            className="self-center"
            onPress={() =>
              Alert.alert('Discard this count?', 'Nothing has been saved yet. The shelf stays as it is.', [
                { text: 'Keep counting', style: 'cancel' },
                {
                  text: 'Discard',
                  style: 'destructive',
                  onPress: () => {
                    setAuditDraft(null);
                    setCurrentScan(null);
                    router.back();
                  },
                },
              ])
            }
          />
        </View>
      </FadeInUp>
    </Screen>
  );
}
