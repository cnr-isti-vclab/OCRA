# Monitoring (Prometheus metrics)

OCRA exposes `GET /metrics` in the Prometheus text format so that the ECHOES
monitoring platform (Prometheus / OpenTelemetry Collector → Grafana Mimir) can
scrape it. The metrics cover the service-level indicators of ECHOES D9.1 §6.7.2
(request rate, errors, latency, readiness, resources) and its user-adoption
indicators (users, activity, projects, annotations).

Implementation: `backend/src/services/metrics.service.ts` (definitions),
`backend/src/controllers/metrics.controller.ts` (token guard),
`backend/src/routes/metrics.routes.ts`. HTTP metrics are recorded by
`requestLogger` in `backend/src/middleware/logging.middleware.ts`.

## Enabling the endpoint

The endpoint is **disabled (404) unless `METRICS_TOKEN` is set**. When set,
every request must carry `Authorization: Bearer <METRICS_TOKEN>`; otherwise 401.

1. Generate a token: `openssl rand -hex 32`.
2. Set it in the env file passed to Compose (`.env.egi-demo` locally, `.env.prod`
   in production). `docker-compose.yml` forwards it to the backend; the native
   backend (`npm run dev:backend`) reads `.env.egi-demo` through dotenv.
   Never put it in the tracked `backend/.env`.
3. Restart the backend and check:

   ```bash
   curl -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3002/metrics
   ```

In production `docker/nginx.conf` proxies `location = /metrics` to the backend,
so the scrape URL is `https://<ocra-host>/metrics` (HTTPS only: the token
travels in a header). Use a different token per environment, and share the
production one with the monitoring team over a secure channel only. To rotate
it, change the value on both sides and restart the backend.

## Scrape configuration

For the ECHOES monitoring team (Prometheus, or the OpenTelemetry Collector
`prometheus` receiver, which accepts the same `scrape_configs`):

```yaml
scrape_configs:
  - job_name: ocra
    scheme: https
    metrics_path: /metrics
    scrape_interval: 60s
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/secrets/ocra_token
    static_configs:
      - targets: ['<ocra-host>']
```

Keep the interval at 30 s or more: each scrape runs the readiness check
(including the EGI OIDC discovery request) and the usage count queries, about
0.5 s per scrape. Service and environment labels should be added by the
scraper, not by OCRA.

## Metrics

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `ocra_http_requests_total` | counter | `method`, `route`, `status` | Requests served. `route` is the Express route template (`/api/projects/:projectId`); unrouted 404s share `route="unmatched"` |
| `ocra_http_request_duration_seconds` | histogram | `method`, `route` | Request latency |
| `ocra_ready` | gauge | — | 1 when all dependencies are ready (same check as `/ready`) |
| `ocra_dependency_up` | gauge | `dependency` = postgres \| mongo \| oidc | 1 when the dependency is reachable |
| `process_*`, `nodejs_*` | various | — | `prom-client` default process metrics (CPU, memory, event loop) |
| `ocra_users` | gauge | — | Registered users |
| `ocra_active_users` | gauge | `window` = 1d \| 7d \| 30d | Distinct users with a successful login in the window (audit log) |
| `ocra_active_sessions` | gauge | — | Sessions not yet expired |
| `ocra_online_users` | gauge | — | Distinct users with a live project presence lease |
| `ocra_projects` | gauge | `echoes_linked` = true \| false | Projects, split by link to an ECHOES digital twin |
| `ocra_project_members` | gauge | `role` | Project role assignments |
| `ocra_annotations` | gauge | `kind` = geometry \| data \| link | Annotation entities not soft-deleted |
| `ocra_audit_events` | gauge | `action` | Audit events recorded, by action |

Usage gauges are recomputed from the databases on each scrape; if those queries
fail, the service-level metrics are still served. Uptime is Prometheus' own
`up{job="ocra"}`.

## Useful queries

```promql
sum by (route) (rate(ocra_http_requests_total[5m]))                       # throughput
sum(rate(ocra_http_requests_total{status=~"5.."}[5m]))
  / sum(rate(ocra_http_requests_total[5m]))                               # error ratio
histogram_quantile(0.95,
  sum by (le, route) (rate(ocra_http_request_duration_seconds_bucket[5m]))) # p95 latency
sum(rate(ocra_http_requests_total{status=~"401|403"}[5m]))                # auth failures
avg_over_time(up{job="ocra"}[30d])                                        # uptime ratio
```

## Testing locally with Prometheus

```bash
mkdir -p /tmp/ocra-prom && cd /tmp/ocra-prom
grep '^METRICS_TOKEN=' <repo>/.env.egi-demo | cut -d= -f2- | tr -d '\n' > token
cat > prometheus.yml <<'EOF'
scrape_configs:
  - job_name: ocra
    scrape_interval: 5s
    authorization: { type: Bearer, credentials_file: /etc/prometheus/token }
    static_configs: [{ targets: ['backend:3002'] }]
EOF
docker run -d --name ocra-prom-test --network ocra_default -p 127.0.0.1:9090:9090 \
  -v "$PWD/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$PWD/token:/etc/prometheus/token:ro" prom/prometheus:v3.5.0
```

Open http://localhost:9090, check *Status → Targets* (`ocra` should be `UP`), and
query e.g. `ocra_ready`. Remove with `docker rm -f ocra-prom-test`.
