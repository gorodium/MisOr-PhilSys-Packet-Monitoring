export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    attempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
) {
  const attempts = options.attempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 3000;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || options.shouldRetry?.(error) === false) {
        break;
      }

      const delay = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

