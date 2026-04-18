import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../lib/http";

type AuthUser = {
  userId: number;
  correo: string;
  institucionId: number | null;
  sedeId?: number | null;
  roles: string[];
  nombre: string;
  institucionNombre?: string | null;
  institucionNombreComercial?: string | null;
  institucionLogoUrl?: string | null;
  debeCambiarClave?: boolean;
  tipoUsuario?: string | null;
  estudianteId?: number | null;
};

type LoginResult = {
  token: string;
  user: AuthUser | null;
  requiereCambioClave?: boolean;
};

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (correo: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "auth_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem(TOKEN_KEY)
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshMe() {
    try {
      const response = await api.get("/auth/me");
      const data = response.data?.data || response.data;
      setUser(data || null);
    } catch (error) {
      console.error("Error cargando sesión:", error);
      setUser(null);
      setToken(null);
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  async function login(correo: string, password: string): Promise<LoginResult> {
    const response = await api.post("/auth/login", { correo, password });
    const data = response.data?.data || response.data;

    if (!data?.token) {
      throw new Error("No se recibió token");
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user || null);

    return {
      token: data.token,
      user: data.user || null,
      requiereCambioClave:
        data?.requiereCambioClave === true ||
        data?.user?.debeCambiarClave === true
    };
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        if (token) {
          await refreshMe();
        }
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      refreshMe,
      setUser
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }

  return context;
}