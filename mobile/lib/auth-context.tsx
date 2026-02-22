import React, { createContext, useContext, useEffect, useState } from "react";
import api, {
  getAccessToken,
  getRefreshToken,
  storeTokens,
  clearTokens,
  BASE_URL,
} from "./api-client";
import axios from "axios";

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: { id: string; email: string } | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
  });

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const accessToken = await getAccessToken();

      if (accessToken) {
        setState({ isLoading: false, isAuthenticated: true, user: null });
        return;
      }

      const refreshToken = await getRefreshToken();

      if (refreshToken) {
        try {
          const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, {
            refreshToken,
          });
          await storeTokens(data.accessToken, data.refreshToken);
          setState({ isLoading: false, isAuthenticated: true, user: null });
          return;
        } catch {
          await clearTokens();
        }
      }

      setState({ isLoading: false, isAuthenticated: false, user: null });
    } catch {
      setState({ isLoading: false, isAuthenticated: false, user: null });
    }
  }

  async function login(email: string, password: string) {
    const { data } = await api.post("/api/auth/token-login", {
      email,
      password,
    });
    await storeTokens(data.accessToken, data.refreshToken);
    setState({ isLoading: false, isAuthenticated: true, user: data.user });
  }

  async function signup(email: string, password: string) {
    await api.post("/api/auth/signup", { email, password });
    await login(email, password);
  }

  async function logout() {
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        await api.post("/api/auth/token-logout", { refreshToken });
      }
    } catch {
      // best-effort logout
    } finally {
      await clearTokens();
      setState({ isLoading: false, isAuthenticated: false, user: null });
    }
  }

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
