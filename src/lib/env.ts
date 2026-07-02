const truthy = new Set(["1", "true", "yes", "on"]);

export function readBooleanEnv(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }

  return truthy.has(value.toLowerCase());
}

export function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function readEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function getRuntimeConfig() {
  return {
    demoMode: readBooleanEnv("DEMO_MODE", true),
    defaultRole: readEnv("APP_DEFAULT_ROLE", process.env.NODE_ENV === "production" ? "viewer" : "admin"),
    trustedAuthHeader: readBooleanEnv("TRUSTED_AUTH_HEADER", false),
    authRoleHeader: readEnv("AUTH_ROLE_HEADER", "x-philsys-role"),
    matrixMode: readEnv("MATRIX_MODE", readBooleanEnv("DEMO_MODE", true) ? "demo" : "http"),
    rateLimitMax: readNumberEnv("RATE_LIMIT_MAX", 120),
    rateLimitWindowSeconds: readNumberEnv("RATE_LIMIT_WINDOW_SECONDS", 60)
  };
}
