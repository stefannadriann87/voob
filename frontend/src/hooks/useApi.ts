import axios, { AxiosInstance } from "axios";
import { useMemo } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function useApi(): AxiosInstance {
  const instance = useMemo(() => {
    const client = axios.create({
      baseURL: API_URL,
      withCredentials: false,
      timeout: 10000, // 10 second timeout
    });

    client.interceptors.request.use(
      (config) => {
        if (typeof window !== "undefined") {
          const token = window.localStorage.getItem("larstef_token");
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
        return config;
      },
      (error) => {
        console.error("Request interceptor error:", error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for better error handling
    client.interceptors.response.use(
      (response) => response,
      (error) => {
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

