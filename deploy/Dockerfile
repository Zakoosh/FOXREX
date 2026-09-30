# Optional container image for the FOXREX worker (always-on host alternative to systemd).
# The publishing clone, data dir and SSH deploy key are mounted — nothing secret is baked in.
#   docker build -f deploy/Dockerfile -t foxrex-worker .
#   docker run -d --name foxrex-worker --restart unless-stopped -p 127.0.0.1:8787:8787 \
#     --env-file worker/.env -e HOST=0.0.0.0 -e DATA_DIR=/data -e PUBLISH_REPO_DIR=/publish \
#     -v foxrex-data:/data -v /srv/foxrex-publish:/publish -v /srv/foxrex-ssh:/home/node/.ssh:ro foxrex-worker
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker/ worker/
COPY studio/cms-model.js studio/cms-model.js
COPY tools/ tools/
COPY data/content.schema.json data/content.schema.json
RUN rm -f worker/.env && mkdir -p /data /publish && chown -R node:node /data /publish
USER node
ENV NODE_ENV=production GIT_TERMINAL_PROMPT=0
WORKDIR /app/worker
EXPOSE 8787
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
