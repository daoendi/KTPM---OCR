import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const userKey = "auth_user";

// ensure axios sends credentials (cookies)
axios.defaults.withCredentials = true;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const s = localStorage.getItem(userKey);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  });
  const [isReady, setIsReady] = useState(false);

  // try to restore session from cookie on mount
  useEffect(() => {
    let mounted = true;
    const fetchMe = async () => {
      try {
        const res = await axios.get("/api/auth/me");
        if (!mounted) return;
        if (res.data ?.user) {
          setUser(res.data.user);
          try {
            localStorage.setItem(userKey, JSON.stringify(res.data.user));
          } catch (e) {}
        }
      } catch (e) {
        // no session or backend unreachable
      } finally {
        if (mounted) setIsReady(true);
      }
    };
    if (!user) fetchMe();
    else setIsReady(true);
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (username, password) => {
    const res = await axios.post(
      "/api/auth/login",
      { username, password },
      { withCredentials: true }
    );
    const u = res.data.user;
    setUser(u);
    setIsReady(true);
    try {
      localStorage.setItem(userKey, JSON.stringify(u));
    } catch (e) {}
    return u;
  };

  const register = async (username, password, displayName) => {
    const res = await axios.post(
      "/api/auth/register",
      { username, password, displayName },
      { withCredentials: true }
    );
    const u = res.data.user;
    setUser(u);
    setIsReady(true);
    try {
      localStorage.setItem(userKey, JSON.stringify(u));
    } catch (e) {}
    return u;
  };

  const logout = async () => {
    try {
      await axios.post("/api/auth/logout", {}, { withCredentials: true });
    } catch (e) {
      // ignore
    }
    setUser(null);
    setIsReady(true);
    try {
      localStorage.removeItem(userKey);
    } catch (e) {}
  };

  const joinAsGuest = () => {
    const guest = { role: "guest", username: "guest" };
    setUser(guest);
    setIsReady(true);
    try {
      localStorage.setItem(userKey, JSON.stringify(guest));
    } catch (e) {}
  };

  const value = { user, login, logout, register, joinAsGuest, isReady };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
