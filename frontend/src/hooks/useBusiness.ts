import { AxiosError } from "axios";
import { useCallback, useState } from "react";
import useApi from "./useApi";

export interface Service {
  id: string;
  name: string;
  duration: number;
  price: number;
  notes?: string | null;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  specialization?: string | null;
  avatar?: string | null;
}

export interface Business {
  id: string;
  name: string;
  domain: string;
  email?: string | null;
  ownerId?: string;
  owner?: { id: string; name: string; email: string };
  services: Service[];
  employees: Employee[];
}

interface CreateBusinessInput {
  name: string;
  domain: string;
  ownerId: string;
  email?: string;
}

interface CreateServiceInput {
  businessId: string;
  name: string;
  duration: number;
  price: number;
  notes?: string;
}

interface CreateEmployeeInput {
  businessId: string;
  name: string;
  email: string;
  phone?: string;
  specialization?: string;
}

export default function useBusiness() {
  const api = useApi();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBusinesses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Business[]>("/business");
      setBusinesses(data);
      return data;
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      const message =
        axiosError.response?.data?.error ??
        axiosError.message ??
        (err instanceof Error ? err.message : "Eroare la listarea business-urilor.");
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const createBusiness = useCallback(
    async (input: CreateBusinessInput) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<Business>("/business", input);
        setBusinesses((prev) => [data, ...prev]);
        return data;
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la crearea business-ului.");
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const addService = useCallback(
    async ({ businessId, name, duration, price, notes }: CreateServiceInput) => {
      try {
        const { data } = await api.post<Service>(`/business/${businessId}/services`, {
          name,
          duration,
          price,
          notes,
        });
        setBusinesses((prev) =>
          prev.map((business) =>
            business.id === businessId
              ? {
                  ...business,
                  services: [...business.services, data],
                }
              : business
          )
        );
        return data;
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la adăugarea serviciului.");
        setError(message);
        throw err;
      }
    },
    [api]
  );

  const updateService = useCallback(
    async (businessId: string, serviceId: string, name: string, duration: number, price: number, notes?: string) => {
      try {
        const { data } = await api.put<Service>(`/business/${businessId}/services/${serviceId}`, {
          name,
          duration,
          price,
          notes,
        });
        setBusinesses((prev) =>
          prev.map((business) =>
            business.id === businessId
              ? {
                  ...business,
                  services: business.services.map((service) =>
                    service.id === serviceId ? data : service
                  ),
                }
              : business
          )
        );
        return data;
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la actualizarea serviciului.");
        setError(message);
        throw err;
      }
    },
    [api]
  );

  const deleteService = useCallback(
    async (businessId: string, serviceId: string) => {
      try {
        await api.delete(`/business/${businessId}/services/${serviceId}`);
        setBusinesses((prev) =>
          prev.map((business) =>
            business.id === businessId
              ? {
                  ...business,
                  services: business.services.filter((service) => service.id !== serviceId),
                }
              : business
          )
        );
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la ștergerea serviciului.");
        setError(message);
        throw err;
      }
    },
    [api]
  );

  const addEmployee = useCallback(
    async ({ businessId, name, email, phone, specialization }: CreateEmployeeInput) => {
      try {
        const { data } = await api.post<Employee>(`/business/${businessId}/employees`, {
          name,
          email,
          phone,
          specialization,
        });
        setBusinesses((prev) =>
          prev.map((business) =>
            business.id === businessId
              ? {
                  ...business,
                  employees: [...business.employees, data],
                }
              : business
          )
        );
        return data;
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la adăugarea employee-ului.");
        setError(message);
        throw err;
      }
    },
    [api]
  );

  const updateEmployee = useCallback(
    async (businessId: string, employeeId: string, name: string, email: string, phone?: string, specialization?: string) => {
      try {
        const { data } = await api.put<Employee>(`/business/${businessId}/employees/${employeeId}`, {
          name,
          email,
          phone,
          specialization,
        });
        setBusinesses((prev) =>
          prev.map((business) =>
            business.id === businessId
              ? {
                  ...business,
                  employees: business.employees.map((employee) =>
                    employee.id === employeeId ? data : employee
                  ),
                }
              : business
          )
        );
        return data;
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la actualizarea angajatului.");
        setError(message);
        throw err;
      }
    },
    [api]
  );

  const deleteEmployee = useCallback(
    async (businessId: string, employeeId: string) => {
      try {
        await api.delete(`/business/${businessId}/employees/${employeeId}`);
        setBusinesses((prev) =>
          prev.map((business) =>
            business.id === businessId
              ? {
                  ...business,
                  employees: business.employees.filter((employee) => employee.id !== employeeId),
                }
              : business
          )
        );
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la ștergerea angajatului.");
        setError(message);
        throw err;
      }
    },
    [api]
  );

  return {
    businesses,
    loading,
    error,
    fetchBusinesses,
    createBusiness,
    addService,
    updateService,
    deleteService,
    addEmployee,
    updateEmployee,
    deleteEmployee,
  };
}

