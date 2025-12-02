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
  captchaToken?: string;
}

interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: Role;
  businessName?: string;
  businessType?: BusinessTypeValue;
  captchaToken?: string;
}

interface JwtPayload {
  userId: string;
  role: Role;
  exp?: number;
}

const AUTH_EVENT = "larstef-auth-change";

/**
 * Extracts a user-friendly error message from an Axios error
 */
function getErrorMessage(err: unknown, defaultMessage: string): string {
  const axiosError = err as AxiosError<{ error?: string }>;
  
  // Prioritize backend error message (already user-friendly)
  if (axiosError.response?.data?.error) {
    return axiosError.response.data.error;
  }
  
  // Provide friendly status-based messages
  if (axiosError.response) {
    const status = axiosError.response.status;
    if (status === 500) {
      return "Eroare de server. Te rugăm să încerci din nou mai târziu.";
    } else if (status === 401) {
      return "Date de autentificare invalide. Verifică email-ul și parola.";
    } else if (status === 403) {
      return "Acces interzis. Nu ai permisiunea de a accesa această resursă.";
    } else if (status === 404) {
      return "Serviciul nu a fost găsit. Te rugăm să contactezi suportul.";
    } else if (status >= 500) {
      return "Eroare de server. Te rugăm să încerci din nou mai târziu.";
    } else if (status >= 400) {
      return "Cerere invalidă. Te rugăm să verifici datele introduse.";
    }
  }
  
  // Handle network/timeout errors
  if (axiosError.code === "ECONNABORTED" || axiosError.message?.includes("timeout")) {
    return "Timpul de așteptare a expirat. Te rugăm să încerci din nou.";
  }
  
  if (axiosError.message?.includes("Network Error") || !axiosError.response) {
    return "Nu s-a putut conecta la server. Verifică conexiunea la internet.";
  }
  
  // Fallback to default message
  return defaultMessage;
}

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
    async ({ email, password, role, captchaToken }: LoginPayload) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<{
          token: string;
          user: AuthUser;
        }>("/auth/login", { email, password, role, captchaToken });

        const decoded = jwtDecode<JwtPayload>(data.token);
        if (decoded.exp && decoded.exp * 1000 < Date.now()) {
          throw new Error("Token expirat");
        }

        persistAuth(data.token, data.user);
        return data.user;
      } catch (err) {
        const message = getErrorMessage(err, "Eroare la autentificare. Te rugăm să încerci din nou.");
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api, persistAuth]
  );

  const register = useCallback(
    async ({ email, password, name, phone, role, businessName, businessType, captchaToken }: RegisterPayload) => {
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
          captchaToken,
        });
        return data.user;
      } catch (err) {
        const message = getErrorMessage(err, "Eroare la înregistrare. Te rugăm să încerci din nou.");
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
        const message = getErrorMessage(err, "Eroare la trimiterea emailului. Te rugăm să încerci din nou.");
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
        const message = getErrorMessage(err, "Eroare la resetarea parolei. Te rugăm să încerci din nou.");
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
        const message = getErrorMessage(err, "Eroare la actualizarea profilului. Te rugăm să încerci din nou.");
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
        try {
          await fetchCurrentUser();
        } catch (error) {
          // If fetch fails, user is not authenticated - this is normal
        }
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

