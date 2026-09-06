import type { ReactNode } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

interface ScreenProps {
  title?: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  headerRight?: ReactNode;
}

/**
 * Screen — the base layout for every page.
 * Provides a safe-area background, an optional title bar, and a scroll view.
 */
export default function Screen({ title, children, onRefresh, refreshing, headerRight }: ScreenProps) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgLight }}>
      {title ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 14,
            backgroundColor: colors.white,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary }}>{title}</Text>
          {headerRight}
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
