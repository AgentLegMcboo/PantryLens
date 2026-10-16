import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { FadeInUp, PRESS_SCALE_ROW, Tappable } from '../components/motion';
import { Button, Card, CardHeader, ImageEdge, Row, Screen, Segmented, Text } from '../components/ui';
import { cueSuccess, cueTap } from '../lib/feedback';
import { log } from '../lib/log';
import { canEditPantry, canManageTeam, ROLE_BLURBS, ROLE_ICONS, ROLE_LABELS } from '../lib/permissions';
import { usePantryStore, type PantryMember } from '../lib/store';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/time';

/**
 * One person in the pantry: what they've done here, and — for the owner — what
 * they're allowed to do.
 *
 * Everything shown is already recorded against the person who did it: scans
 * (`scanned_by`, with their photos and what was kept), packed batches
 * (`created_by`) and stock taken off the shelf (`recorded_by`). Owners and
 * managers can open it; only the owner gets the role controls, which the
 * database enforces independently.
 */

type Range = '7' | '30' | 'all';

interface ScanRow {
  id: string;
  mode: 'donation' | 'shelf_audit' | 'manual';
  started_at: string;
  verified_at: string | null;
  photos_sent: number;
  items_detected: number;
  items_saved: number;
  units_saved: number;
  photo_paths: string[];
}

interface ScanItemRow {
  id: string;
  detected_name: string;
  final_name: string | null;
  final_count: number | null;
  detected_count: number;
  verdict: 'pending' | 'accepted' | 'edited' | 'rejected';
}

const MODE_LABEL: Record<ScanRow['mode'], string> = {
  donation: 'Donation scan',
  shelf_audit: 'Shelf count',
  manual: 'Added by hand',
};

const VERDICT: Record<ScanItemRow['verdict'], { label: string; color: string }> = {
  accepted: { label: 'Kept', color: COLORS.statusGood },
  edited: { label: 'Corrected', color: COLORS.primaryLight },
  rejected: { label: 'Removed', color: COLORS.textSecondary },
  pending: { label: 'Not reviewed', color: COLORS.textSecondary },
};

export default function MemberScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, session, members, fetchMembers, setMemberRole, transferOwnership, removeMember } =
    usePantryStore();

  const member: PantryMember | undefined = members.find((m) => m.user_id === id);
  const isMe = id === session?.user?.id;
  const canView = canEditPantry(settings.userRole) || isMe;
  const canManage = canManageTeam(settings.userRole) && !isMe;

  const [range, setRange] = useState<Range>('30');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [packs, setPacks] = useState<{ boxes: number; created_at: string }[]>([]);
  const [exits, setExits] = useState<{ reason: string; count: number; occurred_at: string }[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [openScan, setOpenScan] = useState<string | null>(null);
  const [scanItems, setScanItems] = useState<Record<string, ScanItemRow[]>>({});

  const load = useCallback(async () => {
    if (!id || !settings.pantryId) return;
    try {
      const [scanRes, packRes, exitRes] = await Promise.all([
        supabase
          .from('scans')
          .select('id, mode, started_at, verified_at, photos_sent, items_detected, items_saved, units_saved, photo_paths')
          .eq('pantry_id', settings.pantryId)
          .eq('scanned_by', id)
          .order('started_at', { ascending: false })
          .limit(200),
        supabase
          .from('pack_runs')
          .select('boxes, created_at')
          .eq('pantry_id', settings.pantryId)
          .eq('created_by', id),
        supabase
          .from('stock_exits')
          .select('reason, count, occurred_at')
          .eq('pantry_id', settings.pantryId)
          .eq('recorded_by', id),
      ]);
      if (scanRes.error) throw scanRes.error;
      const scanRows = (scanRes.data as ScanRow[]) ?? [];
      setScans(scanRows);
      setPacks((packRes.data as any[]) ?? []);
      setExits((exitRes.data as any[]) ?? []);

      // The first photo of each of the latest uploads, as a thumbnail. Private
      // bucket, so short-lived signed links rather than public URLs.
      const firsts = scanRows
        .slice(0, 20)
        .map((s) => s.photo_paths?.[0])
        .filter((p): p is string => !!p);
      if (firsts.length) {
        const { data } = await supabase.storage.from('scan-photos').createSignedUrls(firsts, 3600);
        const map: Record<string, string> = {};
        (data ?? []).forEach((d) => {
          if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
        });
        setThumbs(map);
      }
    } catch (err: any) {
      log.error('store', 'member activity failed to load', err);
      Alert.alert('Could not load their activity', err?.message ?? 'Please try again.');
    }
  }, [id, settings.pantryId]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    load().finally(() => setLoading(false));
  }, [load, canView]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), fetchMembers().catch(() => {})]);
    setRefreshing(false);
  };

  const since = useMemo(() => {
    if (range === 'all') return 0;
    return Date.now() - Number(range) * 86400000;
  }, [range]);
  const inRange = (iso: string) => new Date(iso).getTime() >= since;

  const stats = useMemo(() => {
    const s = scans.filter((x) => inRange(x.started_at));
    const p = packs.filter((x) => inRange(x.created_at));
    const e = exits.filter((x) => inRange(x.occurred_at));
    const sum = (rows: { reason: string; count: number }[], reason: string) =>
      rows.filter((r) => r.reason === reason).reduce((n, r) => n + r.count, 0);
    return {
      scans: s.length,
      photos: s.reduce((n, x) => n + (x.photos_sent || 0), 0),
      items: s.reduce((n, x) => n + (x.items_saved || 0), 0),
      units: s.reduce((n, x) => n + (x.units_saved || 0), 0),
      boxes: p.reduce((n, x) => n + (x.boxes || 0), 0),
      givenOut: sum(e, 'given_out'),
      discarded: sum(e, 'discarded'),
      lastActive: [
        ...scans.map((x) => x.started_at),
        ...packs.map((x) => x.created_at),
        ...exits.map((x) => x.occurred_at),
      ].sort().pop(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scans, packs, exits, since]);

  const toggleScan = async (scanId: string) => {
    cueTap();
    if (openScan === scanId) {
      setOpenScan(null);
      return;
    }
    setOpenScan(scanId);
    if (scanItems[scanId]) return;
    const { data, error } = await supabase
      .from('scan_items')
      .select('id, detected_name, final_name, final_count, detected_count, verdict')
      .eq('scan_id', scanId);
    if (!error) setScanItems((prev) => ({ ...prev, [scanId]: (data as ScanItemRow[]) ?? [] }));
  };

  /** One of the owner's actions; leaves the page if the person is gone. */
  const run = async (what: string, action: () => Promise<void>, leave = false) => {
    setBusy(true);
    try {
      await action();
      cueSuccess();
      if (leave) router.back();
    } catch (err: any) {
      Alert.alert(`Could not ${what}`, err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!member) {
    return (
      <Screen>
        <Text variant="body" tone="soft">
          This person is no longer in the pantry.
        </Text>
      </Screen>
    );
  }

  const name = member.email?.trim() || 'Member';
  const recent = scans.filter((x) => inRange(x.started_at)).slice(0, 20);

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
      }
    >
      {/* Who */}
      <FadeInUp index={0}>
        <View className="flex-row items-center gap-3.5">
          <View className="h-14 w-14 items-center justify-center rounded-lg bg-brand">
            <Text variant="title" tone="on" className="font-bold">
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text variant="heading" numberOfLines={1} className="font-bold">
              {name}
              {isMe ? ' (you)' : ''}
            </Text>
            <Text variant="label" tone="soft">
              {ROLE_LABELS[member.role]} · joined {timeAgo(member.joined_at)}
              {stats.lastActive ? ` · active ${timeAgo(stats.lastActive)}` : ''}
            </Text>
          </View>
        </View>
      </FadeInUp>

      {!canView ? (
        <Text variant="body" tone="soft">
          Only the pantry's owner and managers can see someone else's activity.
        </Text>
      ) : loading ? (
        <ActivityIndicator color={COLORS.primary} />
      ) : (
        <>
          <FadeInUp index={1}>
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: 'all', label: 'All time' },
              ]}
            />
          </FadeInUp>

          {/* What they've done, in numbers. */}
          <FadeInUp index={2}>
            <View className="flex-row flex-wrap gap-2.5">
              <Stat icon="camera-outline" value={stats.scans} label="scans" hint={`${stats.photos} photos`} />
              <Stat icon="tray-arrow-down" value={stats.items} label="items added" hint={`${stats.units} units`} />
              <Stat icon="package-variant-closed" value={stats.boxes} label="boxes packed" />
              <Stat
                icon="hand-heart-outline"
                value={stats.givenOut}
                label="given out"
                hint={stats.discarded ? `${stats.discarded} thrown away` : undefined}
              />
            </View>
          </FadeInUp>

          {/* What they uploaded. */}
          <FadeInUp index={3}>
            <Card className="gap-1 p-4">
              <CardHeader
                title="Uploads"
                subtitle={recent.length ? 'Tap one to see what was kept from it.' : undefined}
                className="mb-1"
              />
              {recent.length === 0 ? (
                <Text variant="label" tone="soft">
                  No scans in this period.
                </Text>
              ) : (
                recent.map((scan, i) => {
                  const thumb = scan.photo_paths?.[0] ? thumbs[scan.photo_paths[0]] : undefined;
                  const open = openScan === scan.id;
                  return (
                    <View
                      key={scan.id}
                      style={i > 0 ? { borderTopWidth: 1, borderTopColor: COLORS.borderSoft } : undefined}
                    >
                      <Tappable
                        scaleTo={PRESS_SCALE_ROW}
                        onPress={() => toggleScan(scan.id)}
                        accessibilityRole="button"
                        className="flex-row items-center gap-3 py-3"
                      >
                        {thumb ? (
                          <View className="h-12 w-12">
                            <Image source={{ uri: thumb }} className="h-full w-full rounded-md bg-muted" />
                            <ImageEdge radius={8} />
                          </View>
                        ) : (
                          <View className="h-12 w-12 items-center justify-center rounded-md bg-subtle">
                            <MaterialCommunityIcons
                              name={scan.photo_paths?.length ? 'image-outline' : 'image-off-outline'}
                              size={20}
                              color={COLORS.textSecondary}
                            />
                          </View>
                        )}
                        <View className="flex-1">
                          <Text variant="body" className="font-semibold">
                            {MODE_LABEL[scan.mode]}
                          </Text>
                          <Text variant="micro" tone="soft">
                            {timeAgo(scan.started_at)} · {scan.photos_sent} photo
                            {scan.photos_sent === 1 ? '' : 's'} ·{' '}
                            {scan.verified_at
                              ? `${scan.items_saved} of ${scan.items_detected} kept`
                              : 'not finished'}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name={open ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color={COLORS.textSecondary}
                        />
                      </Tappable>
                      {open && (
                        <View className="mb-3 gap-1.5 rounded-md bg-subtle px-3 py-2.5">
                          {!scanItems[scan.id] ? (
                            <ActivityIndicator size="small" color={COLORS.primary} />
                          ) : scanItems[scan.id].length === 0 ? (
                            <Text variant="micro" tone="soft">
                              Nothing was detected in this scan.
                            </Text>
                          ) : (
                            scanItems[scan.id].map((it) => (
                              <View key={it.id} className="flex-row items-center gap-2">
                                <Text variant="label" className="flex-1" numberOfLines={1}>
                                  {it.final_count ?? it.detected_count}× {it.final_name || it.detected_name}
                                </Text>
                                <Text
                                  variant="micro"
                                  className="font-bold"
                                  style={{ color: VERDICT[it.verdict].color }}
                                >
                                  {VERDICT[it.verdict].label}
                                </Text>
                              </View>
                            ))
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </Card>
          </FadeInUp>
        </>
      )}

      {/* What they may do — the owner's controls. */}
      {canManage && (
        <FadeInUp index={4}>
          <Card className="gap-2">
            <CardHeader title="Role" subtitle={`Currently a ${ROLE_LABELS[member.role].toLowerCase()}`} className="mb-1" />
            {(['admin', 'volunteer'] as const).map((role) => (
              <Row
                key={role}
                icon={ROLE_ICONS[role]}
                label={ROLE_LABELS[role]}
                hint={ROLE_BLURBS[role]}
                divider={role === 'admin'}
                right={
                  member.role === role ? (
                    <MaterialCommunityIcons name="check" size={22} color={COLORS.statusGood} />
                  ) : undefined
                }
                onPress={
                  member.role === role || busy
                    ? undefined
                    : () => run('change that role', () => setMemberRole(member.user_id, role))
                }
              />
            ))}
            <View className="mt-2 gap-2">
              <Button
                label="Make them the owner"
                variant="secondary"
                block
                disabled={busy}
                icon={<MaterialCommunityIcons name="crown-outline" size={18} color={COLORS.primaryDark} />}
                onPress={() =>
                  Alert.alert(
                    `Make ${name} the owner?`,
                    'They take over the pantry, including who may do what. You stay on as a manager — only they can change that afterwards.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Hand it over',
                        style: 'destructive',
                        onPress: () => run('transfer the pantry', () => transferOwnership(member.user_id)),
                      },
                    ],
                  )
                }
              />
              <Button
                label="Remove from pantry"
                variant="criticalGhost"
                block
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    `Remove ${name}?`,
                    'They lose access to this pantry straight away. Anything they scanned, packed or logged stays. They can rejoin with the invite code.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => run('remove that person', () => removeMember(member.user_id), true),
                      },
                    ],
                  )
                }
              />
            </View>
          </Card>
        </FadeInUp>
      )}
    </Screen>
  );
}

/** One number in the activity grid: two to a row. */
function Stat({
  icon,
  value,
  label,
  hint,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: number;
  label: string;
  hint?: string;
}) {
  return (
    <Card className="w-[48.5%] gap-1 p-4">
      <MaterialCommunityIcons name={icon} size={20} color={COLORS.primaryLight} />
      <Text variant="title" className="font-bold">
        {value}
      </Text>
      <Text variant="label" className="font-semibold">
        {label}
      </Text>
      {hint ? (
        <Text variant="micro" tone="soft">
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}
