FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends aria2 ca-certificates && rm -rf /var/lib/apt/lists/* && useradd -u 1000 -m -d /config aria && mkdir -p /downloads && chown -R 1000:1000 /config /downloads
COPY --chmod=755 docker/aria2-entrypoint.sh /usr/local/bin/aria2-entrypoint
USER aria
EXPOSE 6800
ENTRYPOINT ["/usr/local/bin/aria2-entrypoint"]
