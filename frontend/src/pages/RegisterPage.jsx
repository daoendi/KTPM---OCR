import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const auth = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await auth.register(username, password, displayName);
      nav("/");
    } catch (err) {
      setError(err ?.response ?.data ?.error || err.message || "Register failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="auth-title">Đăng ký</h2>
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-row">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="auth-row">
            <label>Display name (tùy chọn)</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="auth-row">
            <label>Password</label>
            <div className="password-wrapper">
              <input
                type={passwordVisible ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={passwordVisible ? "Hide password" : "Show password"}
                onClick={() => setPasswordVisible((v) => !v)}
              >
                {passwordVisible ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
          {error && <div className="auth-error">{error}</div>}
          <div className="auth-actions">
            <button className="primary-btn" disabled={loading} type="submit">
              {loading ? "Đang..." : "Đăng ký"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
