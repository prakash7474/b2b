import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/ui/Screen';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { colors } from '../theme';

export default function LoginScreen() {
  const { loginAsAdmin, loginAsVendor } = useAuth();
  const [role, setRole] = useState<'admin' | 'vendor'>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      if (role === 'admin') {
        await loginAsAdmin(username, password);
      } else {
        await loginAsVendor(vendorId);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.brand}>
          <Text style={styles.logo}>🧁 B2P</Text>
          <Text style={styles.tagline}>Batter-to-Plate Platform</Text>
        </View>

        <View style={styles.toggle}>
          {(['admin', 'vendor'] as const).map((r) => (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              style={[styles.toggleBtn, { backgroundColor: role === r ? colors.primary : colors.white }]}
            >
              <Text style={{ fontWeight: '600', color: role === r ? colors.white : colors.textSecondary }}>
                {r === 'admin' ? 'Admin' : 'Vendor'}
              </Text>
            </Pressable>
          ))}
        </View>

        {role === 'admin' ? (
          <>
            <Input label="Username" value={username} onChangeText={setUsername} placeholder="admin" />
            <Input label="Password" value={password} onChangeText={setPassword} placeholder="••••••" secureTextEntry />
          </>
        ) : (
          <Input label="Vendor ID" value={vendorId} onChangeText={setVendorId} placeholder="V100" />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label={loading ? 'Signing in...' : 'Sign In'} onPress={submit} loading={loading} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 40 },
  brand: { alignItems: 'center', marginBottom: 28 },
  logo: { fontSize: 40, fontWeight: '800', color: colors.primary },
  tagline: { fontSize: 14, color: colors.textSecondary },
  toggle: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8 },
});
