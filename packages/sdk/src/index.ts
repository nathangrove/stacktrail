export type ClientErrorTrackerInit = {
  dsn: string; // e.g. http://localhost:4000/api/events
  projectKey: string;
  ingestKey?: string; // per-project reporting key
  authToken?: string; // optional Bearer token (alternative)
};

// New SDK surface: initStackTrail (keeps backward compatibility via alias)
export function initStackTrail(config: ClientErrorTrackerInit) {
  const send = async (payload: Record<string, unknown>) => {
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (config.ingestKey) headers["X-STACKTRAIL-Ingest-Key"] = config.ingestKey;
      if (config.authToken) headers.authorization = `Bearer ${config.authToken}`;
      await fetch(config.dsn, {
        method: "POST",
        headers,
        body: JSON.stringify({ projectKey: config.projectKey, ...payload })
      });
    } catch {
      // swallow errors; avoid loops
    }
  };

  window.addEventListener("error", (event) => {
    const err = event.error as unknown;
    const message =
      (typeof err === "object" && err && "message" in err && typeof (err as any).message === "string"
        ? (err as any).message
        : event.message) || "Unknown error";

    const stack =
      typeof err === "object" && err && "stack" in err && typeof (err as any).stack === "string"
        ? (err as any).stack
        : undefined;

    void send({
      message,
      stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      level: "error",
      occurredAt: Date.now()
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as unknown;
    const message =
      typeof reason === "string"
        ? reason
        : typeof reason === "object" && reason && "message" in reason && typeof (reason as any).message === "string"
          ? (reason as any).message
          : "Unhandled promise rejection";

    const stack =
      typeof reason === "object" && reason && "stack" in reason && typeof (reason as any).stack === "string"
        ? (reason as any).stack
        : undefined;

    void send({
      message,
      stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      level: "error",
      occurredAt: Date.now()
    });
  });

  return {
    captureException(error: unknown) {
      const message =
        typeof error === "object" && error && "message" in error && typeof (error as any).message === "string"
          ? (error as any).message
          : String(error);
      const stack =
        typeof error === "object" && error && "stack" in error && typeof (error as any).stack === "string"
          ? (error as any).stack
          : undefined;

      void send({
        message,
        stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        level: "error",
        occurredAt: Date.now()
      });
    }
  };
}

// Backwards compatibility alias
export const initClientErrorTracker = initStackTrail;
