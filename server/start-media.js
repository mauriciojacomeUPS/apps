import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { startCloudServer } from "./cloud-server.js";
import { cobaltInfo, cobaltOrigin, youtubeEngine } from "./cobalt-client.js";

export function cobaltEnvironment(env) {
  const client = env.ONDA_COBALT_YOUTUBE_CLIENT || "IOS";
  if (!["IOS", "ANDROID", "YTSTUDIO_ANDROID", "YTMUSIC_ANDROID"].includes(client))
    throw new Error("El cliente de Cobalt no está admitido para las pruebas.");
  const allowed = [
    "PATH",
    "HOME",
    "LANG",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SystemRoot",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
    "REQUESTS_CA_BUNDLE",
  ];
  const result = Object.fromEntries(
    allowed.filter((key) => env[key] !== undefined).map((key) => [key, env[key]]),
  );
  const origin = new URL(cobaltOrigin(env));
  return {
    ...result,
    NODE_ENV: "production",
    API_URL: origin.origin + "/",
    API_PORT: origin.port || "80",
    API_LISTEN_ADDRESS: origin.hostname === "[::1]" ? "::1" : origin.hostname,
    DURATION_LIMIT: "600",
    RATELIMIT_MAX: "30",
    FORCE_LOCAL_PROCESSING: "never",
    CUSTOM_INNERTUBE_CLIENT: client,
  };
}

export async function startMediaRuntime(env = process.env, { signal, logger = console } = {}) {
  const network = [];
  const tracing = env.ONDA_RUN_DOWNLOAD_TESTS === "true" && env.ONDA_RUN_SOURCE_CHECK === "true";
  let child,
    cloud,
    fatal,
    closing,
    ready = false;
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  async function close(code = 0) {
    if (closing) return closing;
    closing = (async () => {
      await cloud?.close();
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        const exited = new Promise((resolve) => child.once("exit", resolve));
        const timer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }, 5000);
        timer.unref();
        child.kill("SIGTERM");
        await exited;
        clearTimeout(timer);
      }
      signal?.removeEventListener("abort", abort);
      finish(code);
    })();
    return closing;
  }
  const abort = () => {
    if (ready) void close();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    if (youtubeEngine(env) === "cobalt") {
      const entry = env.ONDA_COBALT_ENTRY || "/app/src/cobalt.js";
      await access(entry, constants.R_OK);
      signal?.throwIfAborted();
      child = spawn(
        process.execPath,
        [
          "--max-old-space-size=192",
          ...(tracing
            ? ["--import", fileURLToPath(new URL("./cobalt-network-observer.js", import.meta.url))]
            : []),
          entry,
        ],
        {
          cwd: dirname(dirname(entry)),
          env: cobaltEnvironment(env),
          stdio: tracing
            ? ["ignore", "inherit", "inherit", "ipc"]
            : ["ignore", "inherit", "inherit"],
        },
      );
      if (tracing)
        child.on("message", (message) => {
          if (message?.kind !== "onda-network") return;
          const { sequence, origin, path, status, error } = message;
          if (
            !Number.isSafeInteger(sequence) ||
            typeof origin !== "string" ||
            typeof path !== "string"
          )
            return;
          network.push({ sequence, origin, path, status, error });
          if (network.length > 24) network.shift();
        });
      child.once("error", (error) => {
        fatal = error;
        if (ready) void close(1);
      });
      child.once("exit", (code, sig) => {
        if (!closing) {
          fatal = new Error("Cobalt terminó antes de cerrar Onda (" + (code ?? sig) + ").");
          logger.error?.(fatal.message);
          if (ready) void close(1);
        }
      });
      const deadline = Date.now() + 30000;
      let info;
      while (Date.now() < deadline) {
        signal?.throwIfAborted();
        if (fatal) throw fatal;
        info = await cobaltInfo(env);
        if (info) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!info) throw new Error("La instancia privada de Cobalt no pudo arrancar.");
      if (fatal) throw fatal;
      logger.info?.("Cobalt " + info.version + " listo en el servicio privado.");
    }
    signal?.throwIfAborted();
    cloud = await startCloudServer(env, {
      logger,
      cobaltNetwork: () => network,
      stopCobaltDiagnostics: () => {
        if (child?.connected) child.send({ kind: "onda-stop-diagnostics" }, () => {});
      },
    });
    signal?.throwIfAborted();
    if (fatal) throw fatal;
    ready = true;
    logger.info?.("Onda media API listening on port " + cloud.server.address().port);
    return { cloud, done, close };
  } catch (error) {
    await close(1);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  for (const name of ["SIGTERM", "SIGINT"]) process.once(name, () => controller.abort());
  try {
    const runtime = await startMediaRuntime(process.env, { signal: controller.signal });
    process.exitCode = await runtime.done;
  } catch (error) {
    if (!controller.signal.aborted) console.error(error.message);
    process.exitCode = controller.signal.aborted ? 0 : 1;
  }
}
