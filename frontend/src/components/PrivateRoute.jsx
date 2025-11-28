import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";

export default function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user || user.role === "guest") {
    return <Navigate to="/login" replace />;
  }
  return children;
}
