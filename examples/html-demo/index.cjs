"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  initClientErrorTracker: () => initClientErrorTracker
});
module.exports = __toCommonJS(index_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  initClientErrorTracker
});
