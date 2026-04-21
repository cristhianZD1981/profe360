import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth";

type ProtectedRouteProps = {
  children: React.ReactNode;
  allowedRoles?: string[];
};

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

  if (
    allowedRoles?.length &&
    !allowedRoles.some((role) => user?.roles?.includes(role))
  ) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}