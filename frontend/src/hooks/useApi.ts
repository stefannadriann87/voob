import axios, { AxiosInstance } from "axios";
import { useMemo } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
    const client = axios.create({
      baseURL: API_URL,
      withCredentials: true, // IMPORTANT: Trimite cookies automat (inclusiv JWT HttpOnly)
      timeout: 10000, // 10 second timeout
    });

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
          console.error("Network Error - Backend may be down or unreachable:", {
            baseURL: API_URL,
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


