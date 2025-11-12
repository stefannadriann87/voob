import axios, { AxiosInstance } from "axios";
import { useMemo } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function useApi(): AxiosInstance {
  const instance = useMemo(() => {
    const client = axios.create({
      baseURL: API_URL,
      withCredentials: false,
    });

    client.interceptors.request.use((config) => {
      if (typeof window !== "undefined") {
        const token = window.localStorage.getItem("larstef_token");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    });

    return client;
  }, []);

  return instance;
}

