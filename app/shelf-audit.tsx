import { useAppAppearance } from '../lib/appearance';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { FadeInUp } from '../components/motion';
import { ShelfCheckContent, ShelfCheckHelp } from '../components/shelf-check';
import { Card, Screen, Sheet, Text } from '../components/ui';

/**
 * Counting a shelf, as a page. Home opens the same thing as a popup
 * (components/shelf-check.tsx); this route stays for the app map and for
 * audit-review's way back.
 */
export default function ShelfAuditScreen() {
  useAppAppearance(state => state.scheme);
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <Screen>
      <View className="gap-1 px-1 pt-1">
        <Text variant="title" className="font-bold">Check shelf inventory</Text>
        <Text variant="label" tone="soft">Fix the count of food already on a shelf.</Text>
      </View>

      <FadeInUp index={1}>
        <Card>
          <ShelfCheckContent go={to => router.push(to)} onHelp={() => setHelpOpen(true)} />
        </Card>
      </FadeInUp>

      <Sheet visible={helpOpen} onClose={() => setHelpOpen(false)} title="How shelf checks work">
        <ShelfCheckHelp />
      </Sheet>
    </Screen>
  );
}
