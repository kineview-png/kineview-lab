// Client-side reporting hook for errors caught by a React error boundary.
// Prod React does not rethrow boundary-caught errors to window.onerror, so
// anything the boundary swallows is invisible unless it is reported here.
// Point this at your telemetry backend when one is wired up.

type ReportedError = {
  message: string;
  stack?: string;
  route: string;
  context: Record<string, unknown>;
};

// Loaders and server fns commonly throw a raw Response; String(it) is the
// opaque "[object Response]", so pull out the status and URL instead.
function describe(error: unknown): string {
  if (error instanceof Response) {
    return `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  const stack = error instanceof Error ? error.stack : undefined;
  const payload: ReportedError = {
    message: describe(error),
    ...(stack !== undefined && { stack }),
    route: window.location.pathname,
    context: { source: "react_error_boundary", ...context },
  };

  console.error("[error-boundary]", payload);
}
