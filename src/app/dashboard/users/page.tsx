"use client";

import { useState, useEffect } from "react";
import { UserPlus, KeyRound, Check, RefreshCw, Trash2 } from "lucide-react";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [resets, setResets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState("EMPLOYEE");
  const [creating, setCreating] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(data.users);
        setResets(data.resets);
      } else {
        setError(data.error || "Failed to load users");
      }
    } catch (err) {
      setError("An error occurred loading users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, role: newRole })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setNewUsername("");
        fetchUsers();
      } else {
        setError(data.error || "Failed to create user");
      }
    } catch (err) {
      setError("An error occurred while creating user");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (id: string, username: string) => {
    if (!confirm(`Are you sure you want to completely remove the user "${username}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const res = await fetch(`/api/users?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        fetchUsers();
      } else {
        setError(data.error || "Failed to delete user");
      }
    } catch (err) {
      setError("An error occurred while deleting user");
    }
  };

  const handleResetPassword = async (requestId: string, userId: string) => {
    try {
      const res = await fetch("/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, userId })
      });
      if (res.ok) {
        fetchUsers();
      } else {
        alert("Failed to reset password.");
      }
    } catch (err) {
      alert("Error resetting password.");
    }
  };

  if (loading) return <div>Loading user management...</div>;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: "bold" }}>User Management</h1>
        <p className="muted">Manage employee accounts and password reset requests.</p>
      </header>

      {error && <div style={{ color: "var(--danger)", background: "var(--danger-light, #ffebe9)", padding: "1rem", borderRadius: "8px", marginBottom: "1rem" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", alignItems: "start" }}>
        {/* Create User Form */}
        <section style={{ background: "var(--surface)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <UserPlus size={18} /> Create New User
          </h2>
          <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: "500" }}>Username</label>
              <input
                type="text"
                className="input"
                style={{ width: "100%" }}
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="e.g. jdoe"
                required
                minLength={3}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: "500" }}>Role</label>
              <select
                className="input"
                style={{ width: "100%" }}
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              Note: New users will be created with the default password <strong>changeme</strong> and forced to change it on their first login.
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating} style={{ marginTop: "0.5rem" }}>
              {creating ? "Creating..." : "Create Account"}
            </button>
          </form>
        </section>

        {/* Password Resets */}
        <section style={{ background: "var(--surface)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <KeyRound size={18} /> Pending Password Resets
          </h2>
          {resets.length === 0 ? (
            <p className="muted">No pending reset requests.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {resets.map(reset => (
                <div key={reset.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", border: "1px solid var(--border)", borderRadius: "6px" }}>
                  <div>
                    <div style={{ fontWeight: "600" }}>{reset.user.username}</div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>Requested: {new Date(reset.createdAt).toLocaleString()}</div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleResetPassword(reset.id, reset.userId)}
                  >
                    <RefreshCw size={14} style={{ marginRight: "0.25rem" }} /> Reset to "changeme"
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Users List */}
      <section style={{ marginTop: "2rem", background: "var(--surface)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "1rem" }}>All Accounts</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
              <th style={{ padding: "0.75rem 0.5rem", color: "var(--muted)", fontWeight: "500" }}>Username</th>
              <th style={{ padding: "0.75rem 0.5rem", color: "var(--muted)", fontWeight: "500" }}>Role</th>
              <th style={{ padding: "0.75rem 0.5rem", color: "var(--muted)", fontWeight: "500" }}>Requests Filed</th>
              <th style={{ padding: "0.75rem 0.5rem", color: "var(--muted)", fontWeight: "500" }}>Created</th>
              <th style={{ padding: "0.75rem 0.5rem", color: "var(--muted)", fontWeight: "500" }}>Status</th>
              <th style={{ padding: "0.75rem 0.5rem", color: "var(--muted)", fontWeight: "500", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.75rem 0.5rem", fontWeight: "500" }}>{user.username}</td>
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  <span style={{ 
                    padding: "2px 6px", 
                    borderRadius: "4px", 
                    fontSize: "0.8rem", 
                    background: user.role === "ADMIN" ? "#f3e8ff" : "#f1f5f9",
                    color: user.role === "ADMIN" ? "#6b21a8" : "#475569",
                  }}>
                    {user.role}
                  </span>
                </td>
                <td style={{ padding: "0.75rem 0.5rem" }}>{user._count?.filingRequests || 0}</td>
                <td style={{ padding: "0.75rem 0.5rem", fontSize: "0.9rem", color: "var(--muted)" }}>{new Date(user.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  {user.forcePasswordChange ? (
                    <span style={{ color: "#b45309", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      Pending password change
                    </span>
                  ) : (
                    <span style={{ color: "#16a34a", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Check size={14} /> Active
                    </span>
                  )}
                </td>
                <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                  <button 
                    onClick={() => handleDeleteUser(user.id, user.username)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}
                    title="Remove User"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
