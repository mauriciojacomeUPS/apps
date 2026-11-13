import { runSourceProbe } from "./media-processing.js";

const value = process.argv[2];
if (!value) {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  const result = await runSourceProbe(process.env);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.status === "passed" ? 0 : 1;
} else {
  const url = new URL(value);
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Usa la URL HTTPS pública del servidor, sin claves ni parámetros.");
  const endpoint = url.origin + "/healthz";
  let result = { status: "unreachable", message: "El servidor todavía no respondió." };
  const deadline = Date.now() + 150000;
  let lastStatus;
  do {
    try {
      const response = await fetch(endpoint, {
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: { Accept: "application/json" },
      });
      if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
        const status = await response.json();
        result = status.sourceCheck || {
          status: "not-configured",
          message: "Este servidor no informa una prueba de fuentes.",
        };
        if (result.status !== lastStatus) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
          lastStatus = result.status;
        }
        if (result.status !== "checking") break;
      }
    } catch {}
    if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 3000));
  } while (Date.now() < deadline);
  if (result.status === "unreachable") process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.status === "passed" ? 0 : 1;
}
