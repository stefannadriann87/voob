import { AxiosError } from "axios";
import { useCallback, useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import useApi from "./useApi";
import type { BusinessTypeValue } from "../constants/businessTypes";

export type Role = "CLIENT" | "BUSINESS" | "EMPLOYEE" | "SUPERADMIN";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  specialization?: string | null;
  avatar?: string | null;
  role: Role;
  business?: {
    id: string;
    name: string;
    domain?: string | null;
    email?: string | null;
    businessType?: BusinessTypeValue;
  } | null;
  createdAt?: string;
}

interface LoginPayload {
  email: string;
  password: string;
  role?: Role;
}

interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: Role;
  businessName?: string;
  businessType?: BusinessTypeValue;
}

interface JwtPayload {
  userId: string;
  role: Role;
  exp?: number;
}

const AUTH_EVENT = "larstef-auth-change";

function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("larstef_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export default function useAuth() {
  const api = useApi();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncFromStorage = useCallback(() => {
    setUser(getStoredUser());
  }, []);

  const persistAuth = useCallback((token: string, userPayload: AuthUser) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("larstef_token", token);
    window.localStorage.setItem("larstef_user", JSON.stringify(userPayload));
    window.dispatchEvent(new Event(AUTH_EVENT));
    setUser(userPayload);
  }, []);

  const login = useCallback(
    async ({ email, password, role }: LoginPayload) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<{
          token: string;
          user: AuthUser;
        }>("/auth/login", { email, password, role });

        const decoded = jwtDecode<JwtPayload>(data.token);
        if (decoded.exp && decoded.exp * 1000 < Date.now()) {
          throw new Error("Token expirat");
        }

        persistAuth(data.token, data.user);
        return data.user;
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la autentificare.");
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api, persistAuth]
  );

  const register = useCallback(
    async ({ email, password, name, phone, role, businessName, businessType }: RegisterPayload) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<{ user: AuthUser }>("/auth/register", {
          email,
          password,
          name,
          phone,
          role,
          businessName,
          businessType,
        });
        return data.user;
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la înregistrare.");
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const requestPasswordReset = useCallback(
    async (email: string) => {
      setLoading(true);
      setError(null);
      try {
        await api.post("/auth/forgot-password", { email });
        return true;
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la trimiterea emailului.");
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const resetPassword = useCallback(
    async (token: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        await api.post("/auth/reset-password", { token, password });
        return true;
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la resetarea parolei.");
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("larstef_token");
      window.localStorage.removeItem("larstef_user");
      window.dispatchEvent(new Event(AUTH_EVENT));
    }
    setUser(null);
    setHydrated(true);
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    if (typeof window === "undefined") return null;
    const token = window.localStorage.getItem("larstef_token");
    if (!token) return null;

    try {
      const { data } = await api.get<{ user: AuthUser }>("/auth/me");
      window.localStorage.setItem("larstef_user", JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } catch (err) {
      console.error("Failed to fetch current user:", err);
      logout();
      return null;
    }
  }, [api, logout]);

  const updateProfile = useCallback(
    async (data: { phone?: string; name?: string; specialization?: string; avatar?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const { data: updatedUser } = await api.put<{ user: AuthUser }>("/auth/me", data);
        window.localStorage.setItem("larstef_user", JSON.stringify(updatedUser.user));
        setUser(updatedUser.user);
        window.dispatchEvent(new Event(AUTH_EVENT));
        return updatedUser.user;
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la actualizarea profilului.");
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const initialize = async () => {
      const stored = getStoredUser();
      if (stored) {
        setUser(stored);
        setHydrated(true);
      } else {
        await fetchCurrentUser();
        setHydrated(true);
      }
    };

    void initialize();

    const handle = () => syncFromStorage();
    window.addEventListener(AUTH_EVENT, handle);
    return () => {
      window.removeEventListener(AUTH_EVENT, handle);
    };
  }, [fetchCurrentUser, syncFromStorage]);

  return {
    user,
    hydrated,
    loading,
    error,
    login,
    register,
    requestPasswordReset,
    resetPassword,
    fetchCurrentUser,
    updateProfile,
    logout,
  };
}

