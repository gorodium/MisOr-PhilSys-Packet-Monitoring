"use client";

import { Save } from "lucide-react";
import { useEffect, useState } from "react";

type Setting = {
  key: string;
  label: string;
  value: string;
  type: "text" | "number" | "boolean" | "textarea" | "select";
  options?: string[];
  required?: boolean;
};

export function SettingsClient() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadSettings() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load settings.");
      }
      setSettings(payload.settings);
      setValues(
        Object.fromEntries(payload.settings.map((setting: Setting) => [setting.key, setting.value ?? ""]))
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function saveSettings() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save settings.");
      }
      setMessage("Settings saved.");
      setSettings(payload.settings);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  function updateValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-kicker">{loading ? "Loading" : `${settings.length} settings`}</p>
        </div>
        <button className="btn btn-primary" onClick={saveSettings} disabled={saving || loading}>
          <Save size={16} />
          Save Settings
        </button>
      </header>

      {message ? <div className="alert">{message}</div> : null}
      {error ? <div className="alert error-text">{error}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Configuration</h2>
        </div>
        <div className="form-grid">
          {settings.map((setting) => (
            <label
              key={setting.key}
              className={`form-field ${setting.type === "textarea" ? "form-field-wide" : ""}`}
            >
              <span className="field-label">{setting.label}</span>
              {setting.type === "textarea" ? (
                <textarea
                  className="textarea"
                  value={values[setting.key] ?? ""}
                  onChange={(event) => updateValue(setting.key, event.target.value)}
                  required={setting.required}
                />
              ) : setting.type === "select" ? (
                <select
                  className="select"
                  value={values[setting.key] ?? ""}
                  onChange={(event) => updateValue(setting.key, event.target.value)}
                >
                  {(setting.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : setting.type === "boolean" ? (
                <span className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={(values[setting.key] ?? "") === "true"}
                    onChange={(event) => updateValue(setting.key, event.target.checked ? "true" : "false")}
                  />
                  Enabled
                </span>
              ) : (
                <input
                  className="input"
                  type={setting.type === "number" ? "number" : "text"}
                  value={values[setting.key] ?? ""}
                  onChange={(event) => updateValue(setting.key, event.target.value)}
                  required={setting.required}
                />
              )}
            </label>
          ))}
        </div>
      </section>
    </>
  );
}

