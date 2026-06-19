import { Navigate } from "react-router-dom";
import { useAuth } from "../state";

export function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  const role = user?.role;
  if (!role || !roles.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
