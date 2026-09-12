import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const AUTH_TOKEN_KEY = 'b2p_auth_token';
export const AUTH_USER_KEY = 'b2p_auth_user';

// Determine default base URL based on platform
const getDefaultBaseUrl = () => {
  if (Platform.OS === 'android') {
    // 10.0.2.2 is Android emulator's alias to host loopback interface
    return 'http://10.0.2.2:5000';
  }
  return 'http://localhost:5000';
};

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || getDefaultBaseUrl();

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
