import { useEffect, useState } from "react";
import { apiClient } from "@/services/apiClient";
import type { Department } from "@/types";

type UseDepartmentsOptions = {
  admin?: boolean;
  includeInactive?: boolean;
};

export function useDepartments(options: UseDepartmentsOptions = {}) {
  const { admin = false, includeInactive = false } = options;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.getDepartments({ admin, includeInactive });
      setDepartments(res.departments || []);
    } catch (err) {
      setDepartments([]);
      setError(err instanceof Error ? err.message : "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [admin, includeInactive]);

  return { departments, loading, error, reload };
}
