import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth";
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
