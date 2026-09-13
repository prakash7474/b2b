// ════════════════════════════════════════════════════════════════════════════
// 📌 API CLIENT SETUP (src/services/api.ts)
// WHAT THIS DOES:
//   Configures Axios to talk to the Flask backend server.
//   Handles auth tokens (Bearer token header) and base URL configuration.
// ════════════════════════════════════════════════════════════════════════════

import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const AUTH_TOKEN_KEY = 'b2p_auth_token';
export const AUTH_USER_KEY = 'b2p_auth_user';

// ── Base URL Configuration ──────────────────────────────────────────────────
// 👉 CHANGE HERE IF ASKED TO CHANGE SERVER IP OR PORT:
//    - Web / iOS: 'http://localhost:5000' (or your PC's Wi-Fi IP, e.g. 'http://192.168.1.5:5000')
//    - Android emulator: 'http://10.0.2.2:5000' (10.0.2.2 routes to host computer localhost)
const getDefaultBaseUrl = () => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000';
  }
  return 'http://localhost:5000';
};

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || getDefaultBaseUrl();

// Create the configured Axios instance
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let authToken: string | null = null;

export const setAuthTokenInMemory = (token: string | null) => {
  authToken = token;
};

// Request interceptor: attach Bearer token
api.interceptors.request.use(
  async (config) => {
    let token = authToken;
    if (!token) {
      token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (token) {
        authToken = token;
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 unauthenticated
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      authToken = null;
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      await AsyncStorage.removeItem(AUTH_USER_KEY);
    }
    return Promise.reject(error);
  }
);
