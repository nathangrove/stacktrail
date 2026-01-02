// src/index.ts
function initClientErrorTracker(config) {
  const send = async (payload) => {
    try {
      const headers = { "content-type": "application/json" };
      if (config.ingestKey) headers["X-CET-Ingest-Key"] = config.ingestKey;
      if (config.authToken) headers.authorization = `Bearer ${config.authToken}`;
      await fetch(config.dsn, {
        method: "POST",
        headers,
        body: JSON.stringify({ projectKey: config.projectKey, ...payload })
      });
    } catch {
    }
  };
  window.addEventListener("error", (event) => {
    const err = event.error;
    const message = (typeof err === "object" && err && "message" in err && typeof err.message === "string" ? err.message : event.message) || "Unknown error";
    const stack = typeof err === "object" && err && "stack" in err && typeof err.stack === "string" ? err.stack : void 0;
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
    const reason = event.reason;
    const message = typeof reason === "string" ? reason : typeof reason === "object" && reason && "message" in reason && typeof reason.message === "string" ? reason.message : "Unhandled promise rejection";
    const stack = typeof reason === "object" && reason && "stack" in reason && typeof reason.stack === "string" ? reason.stack : void 0;
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
    captureException(error) {
      const message = typeof error === "object" && error && "message" in error && typeof error.message === "string" ? error.message : String(error);
      const stack = typeof error === "object" && error && "stack" in error && typeof error.stack === "string" ? error.stack : void 0;
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
export {
  initClientErrorTracker
};
