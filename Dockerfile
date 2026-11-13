# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim
WORKDIR /app

# The optional CA mount is for managed build environments; it is never kept in the image.
RUN --mount=type=secret,id=proxy_ca \
    set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates; \
    if [ -s /run/secrets/proxy_ca ]; then \
      cat /etc/ssl/certs/ca-certificates.crt /run/secrets/proxy_ca > /tmp/onda-build-ca.pem; \
      export PIP_CERT=/tmp/onda-build-ca.pem SSL_CERT_FILE=/tmp/onda-build-ca.pem; \
    fi; \
    python3 -m venv /opt/onda-tools; \
    /opt/onda-tools/bin/pip install --no-cache-dir 'yt-dlp[default]==2026.10.26'; \
    rm -rf /var/lib/apt/lists/* /tmp/onda-build-ca.pem

COPY --chown=node:node --chmod=644 package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -s /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node server ./server

ENV NODE_ENV=production \
    NODE_USE_ENV_PROXY=1 \
    PORT=10000 \
    ONDA_YTDLP_PATH=/opt/onda-tools/bin/yt-dlp \
    ONDA_FFMPEG_PATH=/usr/bin/ffmpeg

USER node
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('node:http').get({hostname:'127.0.0.1',port:process.env.PORT||10000,path:'/healthz'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "server/cloud-server.js"]
