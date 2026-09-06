/**
 * AuthContext — manages login state across the app.
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import authService from '../services/authService';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginAsAdmin: (username: string, password: string) => Promise<void>;
  loginAsVendor: (vendorId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService.me()
      .then((data) => {
        if (data.loggedIn) setUser(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loginAsAdmin = async (username: string, password: string) => {
    await authService.loginAdmin(username, password);
    setUser({ loggedIn: true, role: 'admin', username });
  };

  const loginAsVendor = async (vendorId: string) => {
    const res = await authService.loginVendor(vendorId);
    setUser({ loggedIn: true, role: 'vendor', vendor_id: vendorId, shop_name: res.shop_name });
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginAsAdmin, loginAsVendor, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
