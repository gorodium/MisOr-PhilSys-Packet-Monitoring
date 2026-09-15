"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        if (data.forcePasswordChange) {
          router.push("/change-password");
        } else {
          router.push("/dashboard");
        }
        router.refresh(); 
      } else {
        setError(data.error || "Login failed");
      }
    } catch (err) {
      setError("An error occurred during login.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        setSuccessMsg(data.message);
      } else {
        setError(data.error || "Failed to submit request");
      }
    } catch (err) {
      setError("An error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "1rem" }}>
      <div style={{ width: "100%", maxWidth: "400px", padding: "2.5rem 2rem", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--surface)" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
          {mode === "login" ? "Welcome Back" : "Forgot Password"}
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
          {mode === "login" 
            ? "Log in to your PhilSys Packet Monitoring account."
            : "Enter your username and we will send a password reset request to the admin."
          }
        </p>

        <form onSubmit={mode === "login" ? handleLogin : handleForgot} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          {error && <div style={{ color: "var(--danger)", background: "var(--danger-light, #ffebe9)", padding: "0.75rem", borderRadius: "4px", fontSize: "0.9rem" }}>{error}</div>}
          {successMsg && <div style={{ color: "#166534", background: "#dcfce7", padding: "0.75rem", borderRadius: "4px", fontSize: "0.9rem" }}>{successMsg}</div>}
          
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500", fontSize: "0.9rem" }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              style={{ width: "100%" }}
              placeholder="Enter your username"
              autoFocus
              required
            />
          </div>
          
          {mode === "login" && (
            <div>
              <label style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontWeight: "500", fontSize: "0.9rem" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  style={{ width: "100%", paddingRight: "40px" }}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--muted)"
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}
          
          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: "0.5rem", padding: "0.75rem" }} disabled={loading}>
            {loading ? "Processing..." : (mode === "login" ? "Log In" : "Request Reset")}
          </button>
        </form>

        <div style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.85rem" }}>
          {mode === "login" ? (
            <button 
              type="button" 
              onClick={() => { setMode("forgot"); setError(""); setSuccessMsg(""); }}
              style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer" }}
            >
              Forgot your password?
            </button>
          ) : (
            <button 
              type="button" 
              onClick={() => { setMode("login"); setError(""); setSuccessMsg(""); }}
              style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer" }}
            >
              Back to Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
