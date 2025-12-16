import { AxiosError } from "axios";
import { useCallback, useEffect, useState } from "react";
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
  businessId?: string | null;
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

const AUTH_EVENT = "voob-auth-change";

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

/**
 * Obține user-ul stocat local (doar pentru cache UI, NU pentru autentificare)
 * SECURITATE: Token-ul JWT este în HttpOnly cookie, nu în localStorage
 */
function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("voob_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Hook pentru autentificare
 * 
 * SECURITATE:
 * - JWT este stocat în HttpOnly cookie (nu accesibil din JavaScript)
 * - Doar datele user-ului sunt în localStorage (pentru cache UI)
 * - Token-ul nu este niciodată expus în browser/React
 */
export default function useAuth() {
  const api = useApi();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncFromStorage = useCallback(() => {
    setUser(getStoredUser());
  }, []);

  /**
   * Salvează user-ul în localStorage (doar pentru cache UI)
   * Token-ul este setat automat în HttpOnly cookie de către backend
   */
  const persistUser = useCallback((userPayload: AuthUser) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("voob_user", JSON.stringify(userPayload));
    window.dispatchEvent(new Event(AUTH_EVENT));
    setUser(userPayload);
  }, []);

  /**
   * Fetch user curent de pe server
   * Cookie-ul JWT este trimis automat (withCredentials: true)
   */
  const fetchCurrentUser = useCallback(async () => {
    if (typeof window === "undefined") return null;

    try {
      const { data } = await api.get<{ user: AuthUser }>("/auth/me");
      window.localStorage.setItem("voob_user", JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } catch (err) {
      // 401 = nu e autentificat (normal, nu e eroare)
      // 429 = rate limit - nu șterge user-ul, doar loghează
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.status === 429) {
        console.warn("Rate limit hit for /auth/me, using cached user");
        // Nu șterge user-ul din cache, folosește-l
        const cachedUser = typeof window !== "undefined" ? window.localStorage.getItem("voob_user") : null;
        if (cachedUser) {
          try {
            const user = JSON.parse(cachedUser);
            setUser(user);
            return user;
          } catch {
            // Invalid cache, ignore
          }
        }
        return null;
      }
      if (axiosErr.response?.status !== 401) {
        console.error("Failed to fetch current user:", err);
      }
      // Șterge datele locale dacă sesiunea e invalidă (doar pentru erori non-401, non-429)
      if (axiosErr.response?.status !== 401 && axiosErr.response?.status !== 429) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("voob_user");
        }
        setUser(null);
      }
      return null;
    }
  }, [api]);

  /**
   * Login - Token-ul vine în HttpOnly cookie, nu în response body
   */
  const login = useCallback(
    async ({ email, password, role, captchaToken }: LoginPayload) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<{ user: AuthUser }>("/auth/login", { 
          email, 
          password, 
          role, 
          captchaToken 
        });

        // Debug: Log user data pentru debugging (ALWAYS log)
        console.log("=== FRONTEND LOGIN RESPONSE ===");
        console.log("Full user object:", JSON.stringify(data.user, null, 2));
        console.log("Business:", data.user.business);
        console.log("Business Type:", data.user.business?.businessType);
        console.log("===============================");

        // Token-ul este setat automat în HttpOnly cookie de către backend
        // Salvăm doar user-ul pentru cache UI
        persistUser(data.user);
        
        // Force refresh user from server to ensure we have latest data (especially businessType)
        console.log("=== FORCING USER REFRESH ===");
        try {
          const freshUser = await fetchCurrentUser();
          console.log("Fresh user from /auth/me:", JSON.stringify(freshUser, null, 2));
          if (freshUser) {
            persistUser(freshUser);
            console.log("✅ User refreshed successfully");
            return freshUser;
          }
        } catch (refreshError) {
          // If refresh fails, use the login response user
          console.warn("❌ Failed to refresh user after login, using login response:", refreshError);
        }
        
        return data.user;
      } catch (err) {
        const message = getErrorMessage(err, "Eroare la autentificare. Te rugăm să încerci din nou.");
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api, persistUser, fetchCurrentUser]
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

  /**
   * Logout - Șterge cookie-ul HttpOnly pe backend și datele locale
   */
  const logout = useCallback(async () => {
    try {
      // Șterge cookie-ul JWT pe backend
      await api.post("/auth/logout");
    } catch (err) {
      // Continuă chiar dacă request-ul eșuează (ex: deja deconectat)
      console.error("Logout request failed:", err);
    }
    
    // Șterge datele locale
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("voob_user");
      window.dispatchEvent(new Event(AUTH_EVENT));
    }
    setUser(null);
    setHydrated(true);
  }, [api]);

  const updateProfile = useCallback(
    async (data: { phone?: string; name?: string; specialization?: string; avatar?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const { data: updatedUser } = await api.put<{ user: AuthUser }>("/auth/me", data);
        window.localStorage.setItem("voob_user", JSON.stringify(updatedUser.user));
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

    let isMounted = true; // Flag pentru a preveni state updates după unmount

    const initialize = async () => {
      // Încercăm să luăm user-ul din localStorage (cache)
      const stored = getStoredUser();
      if (stored && isMounted) {
        setUser(stored);
        setHydrated(true);
        // Verificăm în background dacă sesiunea e încă validă
        fetchCurrentUser()
          .then(() => {
            if (isMounted) {
              // User validat
            }
          })
          .catch(() => {
            // Ignorăm eroarea - deja am setat user-ul din cache
          });
      } else if (isMounted) {
        // Nu avem cache, încercăm să luăm de pe server
        try {
          await fetchCurrentUser();
          if (isMounted) {
            setHydrated(true);
          }
        } catch {
          // User nu e autentificat - normal
          if (isMounted) {
            setHydrated(true);
          }
        }
      }
    };

    void initialize();

    // Cleanup: previne state updates după unmount
    return () => {
      isMounted = false;
    };
  }, [fetchCurrentUser]);

  // Separate useEffect for AUTH_EVENT listener
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = () => syncFromStorage();
    window.addEventListener(AUTH_EVENT, handle);
    return () => {
      window.removeEventListener(AUTH_EVENT, handle);
    };
  }, [syncFromStorage]);

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
