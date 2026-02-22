import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "perform_access_token";
const REFRESH_TOKEN_KEY = "perform_refresh_token";

export const BASE_URL = "https://mealplanai.replit.app";

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function storeTokens(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

const AUTH_ROUTES = [
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/token-login",
  "/api/auth/refresh",
  "/api/auth/token-logout",
];

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let refreshSubscribers: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function subscribeTokenRefresh(
  resolve: (token: string) => void,
  reject: (error: unknown) => void
) {
  refreshSubscribers.push({ resolve, reject });
}

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((s) => s.resolve(newToken));
  refreshSubscribers = [];
}

function onRefreshFailed(error: unknown) {
  refreshSubscribers.forEach((s) => s.reject(error));
  refreshSubscribers = [];
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined;
    if (!originalRequest) return Promise.reject(error);

    const url = originalRequest.url ?? "";
    const isAuthRoute = AUTH_ROUTES.some((r) => url.includes(r));

    if (
      error.response?.status !== 401 ||
      isAuthRoute ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh(
          (newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          },
          (err: unknown) => {
            reject(err);
          }
        );
      });
    }

    isRefreshing = true;

    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        await clearTokens();
        return Promise.reject(error);
      }

      const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, {
        refreshToken,
      });

      await storeTokens(data.accessToken, data.refreshToken);
      onTokenRefreshed(data.accessToken);

      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      await clearTokens();
      onRefreshFailed(refreshError);
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
