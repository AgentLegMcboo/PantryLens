import { useAppAppearance } from '../lib/appearance';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '../constants/theme';
import { CrossFadeIcon, FadeInUp, Tappable } from '../components/motion';
import { Badge, Card, CardHeader, EmptyState, Row, Screen, Text } from '../components/ui';
import { cueSuccess } from '../lib/feedback';
import {
  canEditPantry,
  canManageTeam,
  ROLE_BLURBS,
  ROLE_ICONS,
  ROLE_LABELS,
  type PantryRole,
} from '../lib/permissions';
import { usePantryStore, type PantryMember } from '../lib/store';
import { timeAgo } from '../lib/time';
import { ProfileAvatar } from '../components/profile-avatar';
import { loadProfilePhoto } from '../lib/profile-photos';

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
  useAppAppearance(state => state.scheme);
  const { settings, session, members, fetchMembers } = usePantryStore();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(members.length === 0);
  const [copied, setCopied] = useState(false);

  const isOwner = canManageTeam(settings.userRole);
  const canSeeActivity = canEditPantry(settings.userRole);
  const router = useRouter();
  const myId = session?.user?.id;

  const load = async () => {
    try {
      await fetchMembers();
      await Promise.all(usePantryStore.getState().members.map(member => loadProfilePhoto(member.user_id, true)));
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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-transparent">
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
                ? 'Tap anyone to see what they have done here and change what they can do.'
                : canSeeActivity
                  ? 'Tap anyone to see what they have done here.'
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
              <Tappable
                onPress={copyInvite}
                accessibilityRole="button"
                accessibilityLabel="Copy the invite code"
                className="flex-row items-center gap-3 rounded-md bg-subtle px-4 py-3"
              >
                <Text variant="heading" className="flex-1 font-bold tracking-wider">
                  {settings.inviteCode}
                </Text>
                <CrossFadeIcon
                  active={copied}
                  icon="content-copy"
                  activeIcon="check"
                  size={20}
                  color={COLORS.primaryDark}
                  activeColor={COLORS.statusGood}
                />
              </Tappable>
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
                // Owners and managers open anyone's page (their activity, and
                // for the owner the role controls); everyone can open their own.
                const tappable = canSeeActivity || me;
                return (
                  <Row
                    key={member.user_id}
                    leading={<ProfileAvatar userId={member.user_id} name={displayName(member)} />}
                    label={me ? `${displayName(member)} (you)` : displayName(member)}
                    hint={`${ROLE_LABELS[member.role]} · joined ${timeAgo(member.joined_at)}`}
                    divider={i < members.length - 1}
                    onPress={
                      tappable
                        ? () => router.push({ pathname: '/member', params: { id: member.user_id } })
                        : undefined
                    }
                    right={
                      <View className="flex-row items-center gap-2">
                        <Badge label={ROLE_LABELS[member.role]} tone={ROLE_TONE[member.role]} />
                        {tappable && (
                          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
                        )}
                      </View>
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

    </>
  );
}
