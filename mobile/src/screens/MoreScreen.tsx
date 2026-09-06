import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigation } from '../navigation/types';
import Screen from '../components/ui/Screen';
import { colors } from '../theme';

const ROWS: { label: string; screen: keyof RootStackParamList }[] = [
  { label: '📦 Batches', screen: 'Batches' },
  { label: '🔔 Alerts', screen: 'Alerts' },
  { label: '⭐ Recommendations', screen: 'Recommendations' },
  { label: '📈 Demand Forecast', screen: 'DemandForecast' },
  { label: '🌡️ Spoilage Risk', screen: 'SpoilageRisk' },
  { label: '📜 Prediction History', screen: 'History' },
];

export default function MoreScreen() {
  const navigation = useNavigation<RootNavigation>();
  const { logout } = useAuth();

  return (
    <Screen title="More">
      {ROWS.map((row) => (
        <Pressable
          key={row.screen}
          onPress={() => navigation.navigate(row.screen)}
          style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.rowText}>{row.label}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}

      <Pressable onPress={() => logout()} style={styles.logout}>
        <Text style={styles.logoutText}>🚪 Logout</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  rowText: { fontSize: 16, color: colors.textPrimary },
  chevron: { fontSize: 22, color: colors.textMuted },
  logout: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  logoutText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
});
