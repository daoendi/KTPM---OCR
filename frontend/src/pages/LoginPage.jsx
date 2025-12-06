import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthProvider";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const auth = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await auth.login(username, password);
      nav("/");
    } catch (err) {
      setError(err ?.response ?.data ?.error || err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const guest = () => {
    auth.joinAsGuest();
    nav("/");
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="auth-title">Đăng nhập</h2>
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-row">
            <label>Username</label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
              {loading ? "Đang..." : "Đăng nhập"}
            </button>
            <button type="button" onClick={guest} className="ghost-btn">
              Join as Guest
            </button>
          </div>
        </form>
        <div className="auth-foot">
          <a href="/register">Chưa có tài khoản? Đăng ký</a>
        </div>
      </div>
    </div>
  );
}
