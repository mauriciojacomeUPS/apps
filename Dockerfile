# syntax=docker/dockerfile:1
# Official Cobalt image, pinned for reproducible native dependencies (11.7.1).
FROM ghcr.io/imputnet/cobalt@sha256:28540f81d2cffbd9d089c08438e39a7689a7cee7e9a5b0f60de93a22d19f5dbe
USER root
WORKDIR /onda

# The optional CA mount is for managed build environments; it is never kept in the image.
RUN --mount=type=secret,id=proxy_ca \
    set -eu; \
    if [ -s /run/secrets/proxy_ca ]; then \
      cat /etc/ssl/cert.pem /run/secrets/proxy_ca > /tmp/onda-build-ca.pem; \
      export PIP_CERT=/tmp/onda-build-ca.pem SSL_CERT_FILE=/tmp/onda-build-ca.pem; \
    fi; \
    apk add --no-cache ffmpeg python3 py3-pip ca-certificates; \
    python3 -m venv /opt/onda-tools; \
    /opt/onda-tools/bin/pip install --no-cache-dir 'yt-dlp[default]==2026.10.26'; \
    rm -f /tmp/onda-build-ca.pem

COPY --chown=node:node --chmod=644 package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -s /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node server ./server

ENV NODE_ENV=production \
    NODE_USE_ENV_PROXY=1 \
    PORT=10000 \
    ONDA_YOUTUBE_ENGINE=cobalt \
    ONDA_COBALT_ENTRY=/app/src/cobalt.js \
    ONDA_YTDLP_PATH=/opt/onda-tools/bin/yt-dlp \
    ONDA_FFMPEG_PATH=/usr/bin/ffmpeg

USER node
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('node:http').get({hostname:'127.0.0.1',port:process.env.PORT||10000,path:'/healthz'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "--max-old-space-size=96", "server/start-media.js"]
