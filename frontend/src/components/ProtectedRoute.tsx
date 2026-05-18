import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth";

type ProtectedRouteProps = {
  children: React.ReactNode;
  allowedRoles?: string[];
};

function normalizeRole(role: string) {
  return role.trim().toUpperCase();
}

function hasAllowedRole(userRoles: string[] = [], allowedRoles: string[] = []) {
  if (!allowedRoles.length) return true;

  const normalizedUserRoles = userRoles.map(normalizeRole);
  const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

  return normalizedAllowedRoles.some((role) => normalizedUserRoles.includes(role));
}

export default function ProtectedRoute({
  children,
  allowedRoles
}: ProtectedRouteProps) {
  const { token, user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }}>
        Cargando...
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAllowedRole(user?.roles || [], allowedRoles || [])) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
