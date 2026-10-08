import { useAppRouter } from '../components/app-navigation';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { FadeInUp } from '../components/motion';
import { Badge, Button, Card, CardHeader, EmptyState, Row, Screen, Sheet, Text } from '../components/ui';
import { cueSuccess } from '../lib/feedback';
import {
  canManageTeam,
  ROLE_BLURBS,
  ROLE_ICONS,
  ROLE_LABELS,
  type PantryRole,
} from '../lib/permissions';
import { usePantryStore, type PantryMember } from '../lib/store';
import { timeAgo } from '../lib/time';

/**
 * Who is in this pantry, and what each of them may do.
 *
 * There was nowhere to see this and no way to change it: whoever created the
 * pantry was its only admin forever, and everyone who joined afterwards was a
 * volunteer for good. The roles existed in the database and nothing could move
 * anyone between them.
 *
 * Everyone can read this screen — knowing who to ask is the point of it. Only
 * the owner gets the controls, and the database enforces that independently;
 * see lib/permissions.ts and the role functions in the migration.
 */

const ROLE_TONE: Record<PantryRole, 'brand' | 'neutral'> = {
  owner: 'brand',
  admin: 'brand',
  volunteer: 'neutral',
};

/** An email is the only human handle we have. Never show a bare uuid. */
function displayName(member: PantryMember): string {
  return member.email?.trim() || 'Member';
}

export default function TeamScreen() {
  const { settings, session, members, fetchMembers, setMemberRole, transferOwnership, removeMember } =
    usePantryStore();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(members.length === 0);
  const [selected, setSelected] = useState<PantryMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOwner = canManageTeam(settings.userRole);
  const myId = session?.user?.id;

  const load = async () => {
    try {
      await fetchMembers();
    } catch (err: any) {
      Alert.alert('Could not load your team', err?.message ?? 'Please try again.');
    }
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
    // Once, on open. The roster also refreshes with everything else whenever
    // the pantry changes underneath us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const copyInvite = async () => {
    await Clipboard.setStringAsync(settings.inviteCode);
    cueSuccess();
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  /** Runs one of the owner-only actions, closing the sheet only if it worked. */
  const run = async (what: string, action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setSelected(null);
      cueSuccess();
    } catch (err: any) {
      Alert.alert(`Could not ${what}`, err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = (member: PantryMember, role: 'admin' | 'volunteer') =>
    run('change that role', () => setMemberRole(member.user_id, role));

  const confirmTransfer = (member: PantryMember) => {
    Alert.alert(
      `Make ${displayName(member)} the owner?`,
      'They take over the pantry, including who may do what. You stay on as a manager — ' +
        'only they can change that afterwards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hand it over',
          style: 'destructive',
          onPress: () => run('transfer the pantry', () => transferOwnership(member.user_id)),
        },
      ],
    );
  };

  const confirmRemove = (member: PantryMember) => {
    Alert.alert(
      `Remove ${displayName(member)}?`,
      'They lose access to this pantry straight away. Anything they scanned, packed or logged ' +
        'stays. They can rejoin with the invite code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => run('remove that person', () => removeMember(member.user_id)),
        },
      ],
    );
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <>
      <Screen
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        <FadeInUp index={0}>
          <View className="px-1">
            <Text variant="headline">
              {members.length} {members.length === 1 ? 'person' : 'people'} in{' '}
              {settings.pantryName || 'this pantry'}
            </Text>
            <Text variant="body" tone="soft" className="mt-1">
              {isOwner
                ? 'Tap anyone to change what they can do.'
                : 'Your pantry owner decides who can do what.'}
            </Text>
          </View>
        </FadeInUp>

        {/* How anyone new gets in. Shown to everybody: a volunteer being asked
            to bring a friend along on Saturday should not need the owner. */}
        {settings.inviteCode ? (
          <FadeInUp index={1}>
            <Card className="gap-3">
              <CardHeader
                title="Invite code"
                subtitle="New volunteers enter this when they sign up. Everyone joins as a volunteer."
              />
              <Pressable
                onPress={copyInvite}
                accessibilityRole="button"
                accessibilityLabel="Copy the invite code"
                className="flex-row items-center gap-3 rounded-md bg-subtle px-4 py-3"
              >
                <Text variant="heading" className="flex-1 font-bold tracking-wider">
                  {settings.inviteCode}
                </Text>
                <MaterialCommunityIcons
                  name={copied ? 'check' : 'content-copy'}
                  size={20}
                  color={copied ? COLORS.statusGood : COLORS.primaryDark}
                />
              </Pressable>
            </Card>
          </FadeInUp>
        ) : null}

        <FadeInUp index={2}>
          <Card>
            {members.length === 0 ? (
              <EmptyState
                icon="account-multiple-outline"
                title="Just you so far"
                body="Share the invite code above and anyone who joins shows up here."
              />
            ) : (
              members.map((member, i) => {
                const me = member.user_id === myId;
                // The owner may act on anyone but themselves — stepping down
                // is a transfer, which starts from the other person's row.
                const tappable = isOwner && !me;
                return (
                  <Row
                    key={member.user_id}
                    icon={ROLE_ICONS[member.role]}
                    label={me ? `${displayName(member)} (you)` : displayName(member)}
                    hint={`${ROLE_LABELS[member.role]} · joined ${timeAgo(member.joined_at)}`}
                    divider={i < members.length - 1}
                    onPress={tappable ? () => setSelected(member) : undefined}
                    right={
                      tappable ? undefined : (
                        <Badge label={ROLE_LABELS[member.role]} tone={ROLE_TONE[member.role]} />
                      )
                    }
                  />
                );
              })
            )}
          </Card>
        </FadeInUp>

        <FadeInUp index={3}>
          <Card className="gap-3">
            <CardHeader title="What the roles mean" />
            {(['owner', 'admin', 'volunteer'] as PantryRole[]).map(role => (
              <View key={role} className="flex-row items-start gap-3">
                <MaterialCommunityIcons
                  name={ROLE_ICONS[role]}
                  size={18}
                  color={COLORS.primaryLight}
                  style={{ marginTop: 2 }}
                />
                <View className="flex-1">
                  <Text variant="label" className="font-bold">
                    {ROLE_LABELS[role]}
                  </Text>
                  <Text variant="micro" tone="soft" className="mt-0.5">
                    {ROLE_BLURBS[role]}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </FadeInUp>
      </Screen>

      <Sheet
        visible={!!selected}
        title={selected ? displayName(selected) : ''}
        subtitle={selected ? `Currently a ${ROLE_LABELS[selected.role].toLowerCase()}` : undefined}
        onClose={() => !busy && setSelected(null)}
      >
        {selected && (
          <View className="gap-2">
            <Row
              icon={ROLE_ICONS.admin}
              label="Manager"
              hint={ROLE_BLURBS.admin}
              right={
                selected.role === 'admin' ? (
                  <MaterialCommunityIcons name="check" size={22} color={COLORS.statusGood} />
                ) : undefined
              }
              onPress={selected.role === 'admin' ? undefined : () => changeRole(selected, 'admin')}
            />
            <Row
              icon={ROLE_ICONS.volunteer}
              label="Volunteer"
              hint={ROLE_BLURBS.volunteer}
              right={
                selected.role === 'volunteer' ? (
                  <MaterialCommunityIcons name="check" size={22} color={COLORS.statusGood} />
                ) : undefined
              }
              onPress={
                selected.role === 'volunteer' ? undefined : () => changeRole(selected, 'volunteer')
              }
            />

            <View className="mt-2 gap-2">
              <Button
                label="Make them the owner"
                variant="secondary"
                block
                icon={
                  <MaterialCommunityIcons
                    name="crown-outline"
                    size={18}
                    color={COLORS.primaryDark}
                  />
                }
                onPress={() => confirmTransfer(selected)}
              />
              <Button
                label="Remove from pantry"
                variant="criticalGhost"
                block
                onPress={() => confirmRemove(selected)}
              />
            </View>
          </View>
        )}
      </Sheet>
    </>
  );
}
