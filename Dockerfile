# syntax=docker/dockerfile:1

# Node and the development dependencies are used only to produce the static site.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json ./
COPY contract/openapi.yaml ./contract/openapi.yaml
COPY src/ ./src/
COPY public/ ./public/
# An empty value is deliberate: "0" would still enable the truthy Vite guard.
# Local .env files are excluded from the build context, and there is no E2E build argument.
RUN npm run contract:types \
    && VITE_E2E= npm run build \
    && node --input-type=module -e 'import { readdirSync, readFileSync } from "node:fs"; for (const file of readdirSync("dist/assets")) { if (file.endsWith(".js") && /__player|__audio|__offline|installE2E|installOfflineE2E/.test(readFileSync("dist/assets/" + file, "utf8"))) throw new Error("E2E hook in production asset: " + file); }'

FROM caddy:2.11.6-alpine@sha256:d44355d3c2149dc580ce2cac735955d1c08d3d00882c30489c241aa51a5c10d9 AS runtime
# Port 8080 needs no capabilities. Remove the official image's low-port file capability
# so the executable also works when Compose drops all capabilities.
RUN setcap -r /usr/bin/caddy \
    && addgroup -S -g 10001 bardic \
    && adduser -S -D -H -u 10001 -G bardic bardic
# HTTP-only Caddy has no persistent certificates/configuration. Any internal files
# live in /tmp, allowing a read-only root filesystem with a writable /tmp tmpfs.
ENV HOME=/tmp \
    XDG_CONFIG_HOME=/tmp/caddy/config \
    XDG_DATA_HOME=/tmp/caddy/data

COPY --from=build /app/dist/ /srv/
COPY deploy/Caddyfile /etc/caddy/Caddyfile
USER 10001:10001
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
