import axios from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api`
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  const institutionScope = sessionStorage.getItem("profe360_institution_scope");
  const route = window.location.pathname;
  const requiresInstitutionScope = /^\/(estudiantes(?:-matricula)?|matricula|boletas)(\/|$)/.test(route);
  if (institutionScope && requiresInstitutionScope) {
    config.headers = config.headers || {};
    config.headers["x-institucion-id"] = institutionScope;
  }

  return config;
});

export default api;
