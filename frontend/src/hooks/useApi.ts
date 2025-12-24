import axios, { AxiosInstance } from "axios";
import { useMemo } from "react";
import { sanitizeObject } from "../lib/sanitize";
import { logger } from "../lib/logger";

// CRITICAL FIX: In development, use Next.js proxy to avoid cross-origin cookie issues
// Next.js proxy makes requests appear same-origin, so cookies work correctly
// In development (client-side), use /api proxy; in production or SSR, use direct URL
const getApiUrl = (): string => {
  // Check if we're in browser (client-side) and in development
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    return "/api"; // Next.js will proxy to backend via rewrites
  }
  // In production or SSR, use direct backend URL
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
};

/**
 * Hook pentru API calls
 * 
 * SECURITATE: Folosește HttpOnly cookies pentru JWT
 * - withCredentials: true = trimite cookies automat
 * - NU stocăm token în localStorage (vulnerabil la XSS)
 * - Token-ul este gestionat server-side în HttpOnly cookie
 */
export default function useApi(): AxiosInstance {
  const instance = useMemo(() => {
    const apiUrl = getApiUrl();
    const client = axios.create({
      baseURL: apiUrl,
      withCredentials: true, // IMPORTANT: Trimite cookies automat (inclusiv JWT HttpOnly)
      timeout: 10000, // 10 second timeout
    });

    // Request interceptor pentru sanitizare (previne XSS)
    client.interceptors.request.use(
      (config) => {
        // Sanitize request data (skip FormData pentru file uploads)
        if (config.data && typeof config.data === "object" && !(config.data instanceof FormData)) {
          config.data = sanitizeObject(config.data);
        }
        // Sanitize query params
        if (config.params && typeof config.params === "object") {
          config.params = sanitizeObject(config.params);
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor pentru error handling
    client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Handle 401 Unauthorized - user needs to re-login
        if (error.response?.status === 401) {
          // Clear local user data if unauthorized
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("voob_user");
            window.dispatchEvent(new Event("voob-auth-change"));
          }
        }
        
        if (error.code === "ECONNABORTED" || error.message === "Network Error") {
          logger.error("Network Error - Backend may be down or unreachable:", {
            baseURL: apiUrl,
            url: error.config?.url,
            method: error.config?.method,
          });
        }
        return Promise.reject(error);
      }
    );

    return client;
  }, []);

  return instance;
}


