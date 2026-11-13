import { createMediaService } from "./media-service.js";

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const localPeers = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isLocal(request) {
  if (!localPeers.has(request.socket.remoteAddress)) return false;
  if (request.headers["sec-fetch-site"] && request.headers["sec-fetch-site"] !== "same-origin")
    return false;
  try {
    const protocol = request.socket.encrypted ? "https://" : "http://";
    const url = new URL(protocol + request.headers.host);
    if (!localHosts.has(url.hostname)) return false;
    if (request.headers.origin || request.method !== "GET")
      return request.headers.origin === url.origin;
    return true;
  } catch {
    return false;
  }
}

export function mediaTools(env) {
  function attach(server) {
    const service = createMediaService({
      env,
      prefix: server.config.base + "__onda-media",
      hosted: false,
      authorize: (request) => (isLocal(request) ? "local" : null),
      logger: server.config.logger,
    });
    server.middlewares.use(service.handle);
    server.httpServer?.once("close", () => {
      void service.close();
    });
  }
  return { name: "onda-media-tools", configureServer: attach, configurePreviewServer: attach };
}
