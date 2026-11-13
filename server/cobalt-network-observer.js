import diagnostics from "node:diagnostics_channel";

export function networkObservation(request, status, error) {
  let url;
  try {
    url = new URL(request.origin);
  } catch {
    return null;
  }
  if (
    !(
      ["youtube.com", "www.youtube.com", "youtubei.googleapis.com", "www.googleapis.com"].includes(
        url.hostname,
      ) || url.hostname.endsWith(".googlevideo.com")
    )
  )
    return null;
  return {
    origin: url.origin,
    path: String(request.path || "/")
      .split("?")[0]
      .slice(0, 150),
    status: Number.isInteger(status) ? status : null,
    error:
      typeof error?.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)
        ? error.code
        : error
          ? "NETWORK_ERROR"
          : null,
  };
}

if (typeof process.send === "function") {
  const headers = diagnostics.channel("undici:request:headers"),
    errors = diagnostics.channel("undici:request:error");
  let sequence = 0;
  const send = (value) => {
    if (value && process.connected)
      process.send({ kind: "onda-network", sequence: ++sequence, ...value }, () => {});
  };
  const onHeaders = ({ request, response }) =>
    send(networkObservation(request, response.statusCode));
  const onError = ({ request, error }) => send(networkObservation(request, null, error));
  headers.subscribe(onHeaders);
  errors.subscribe(onError);
  process.on("message", (message) => {
    if (message?.kind !== "onda-stop-diagnostics") return;
    headers.unsubscribe(onHeaders);
    errors.unsubscribe(onError);
    if (process.connected) process.disconnect();
  });
}
