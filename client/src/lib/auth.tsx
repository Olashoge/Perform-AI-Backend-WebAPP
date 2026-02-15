import { createContext, useContext, useCallback, useState, useEffect, useRef } from "react";
import { apiRequest, queryClient } from "./queryClient";

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const userRef = useRef<AuthUser | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        userRef.current = data;
        setUser(data);
      } else {
        userRef.current = null;
        setUser(null);
      }
    } catch {
      userRef.current = null;
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    userRef.current = data;
    setUser(data);
    return data;
  }, []);

  const signup = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const res = await apiRequest("POST", "/api/auth/signup", { email, password });
    const data = await res.json();
    userRef.current = data;
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("POST", "/api/auth/logout");
    userRef.current = null;
    setUser(null);
    queryClient.clear();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
