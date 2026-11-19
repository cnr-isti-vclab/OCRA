/**
 * Metrics Service
 *
 * Prometheus metrics scraped by the ECHOES monitoring platform: the service-level
 * indicators of D9.1 §6.7.2 (request rate, errors, latency, readiness, process
 * resources) and the user-adoption indicators (users, projects, annotations, activity).
 * Usage gauges are recomputed from the databases on every scrape.
 */

import client from 'prom-client';
import type { Request } from 'express';
import { getPrismaClient } from '../../db.js';
import { getBackendReadinessReport } from '../lib/readiness.js';
import { aggregateLatestLoginDocs, countAuditEventsByAction } from '../repositories/audit.repository.js';
import { getHdtCollection } from '../repositories/hdt.repository.js';
import {
  ANNOTATION_DATA_COLLECTION_NAME,
  ANNOTATION_GEOMETRY_COLLECTION_NAME,
  ANNOTATION_LINK_COLLECTION_NAME,
  getAnnotationCollection,
} from '../repositories/annotation.repository.common.js';

export const metricsRegistry = new client.Registry();
client.collectDefaultMetrics({ register: metricsRegistry });

const httpRequests = new client.Counter({
  name: 'ocra_http_requests_total',
  help: 'HTTP requests served, by route template and status code',
  labelNames: ['method', 'route', 'status'],
  registers: [metricsRegistry],
});

const httpDuration = new client.Histogram({
  name: 'ocra_http_request_duration_seconds',
  help: 'HTTP request duration in seconds, by route template',
  labelNames: ['method', 'route'],
  registers: [metricsRegistry],
});

const gauge = (name: string, help: string, labelNames: string[] = []) =>
  new client.Gauge({ name, help, labelNames, registers: [metricsRegistry] });

const ready = gauge('ocra_ready', '1 when all backend dependencies are ready');
const dependencyUp = gauge('ocra_dependency_up', '1 when the dependency is reachable', ['dependency']);
const users = gauge('ocra_users', 'Registered users');
const activeUsers = gauge('ocra_active_users', 'Distinct users who logged in within the window', ['window']);
const activeSessions = gauge('ocra_active_sessions', 'Sessions not yet expired');
const onlineUsers = gauge('ocra_online_users', 'Distinct users with a live project presence lease');
const projects = gauge('ocra_projects', 'Projects, split by link to an ECHOES digital twin', ['echoes_linked']);
const projectMembers = gauge('ocra_project_members', 'Project role assignments', ['role']);
const annotations = gauge('ocra_annotations', 'Annotation entities not soft-deleted', ['kind']);
const auditEvents = gauge('ocra_audit_events', 'Audit events recorded, by action', ['action']);

const ACTIVE_USER_WINDOWS: Array<[string, number]> = [['1d', 1], ['7d', 7], ['30d', 30]];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Records one served request; `route` is the Express route template, never the raw URL.
 * Unrouted 404s share one label: the catch-all handler sets baseUrl to the raw path,
 * which would otherwise create a series per scanned URL.
 */
export function recordHttpRequest(req: Request, status: number, durationMs: number): void {
  const route = req.route
    ? `${req.baseUrl}${String(req.route.path)}`
    : (status !== 404 && req.baseUrl) || 'unmatched';
  httpRequests.inc({ method: req.method, route, status: String(status) });
  httpDuration.observe({ method: req.method, route }, durationMs / 1000);
}

async function refreshUsageGauges(): Promise<void> {
  const prisma = getPrismaClient();
  const now = new Date();
  const kinds: Array<[string, string]> = [
    ['geometry', ANNOTATION_GEOMETRY_COLLECTION_NAME],
    ['data', ANNOTATION_DATA_COLLECTION_NAME],
    ['link', ANNOTATION_LINK_COLLECTION_NAME],
  ];

  const projectIds = (await prisma.project.findMany({ select: { id: true } })).map((p) => p.id);
  const [userCount, sessionCount, onlineLeases, roles, linkedCount, logins, actions, annotationCounts] =
    await Promise.all([
      prisma.user.count(),
      prisma.session.count({ where: { expiresAt: { gt: now } } }),
      prisma.projectPresenceLease.findMany({
        where: { heartbeatExpiresAt: { gt: now } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      prisma.projectRole.groupBy({ by: ['role'], _count: { _all: true } }),
      getHdtCollection().then((c) => c.countDocuments({
        projectId: { $in: projectIds },
        'echoesContext.digitalTwinUri': { $exists: true, $ne: null },
      })),
      aggregateLatestLoginDocs(1_000_000, new Date(now.getTime() - 30 * DAY_MS)),
      countAuditEventsByAction(),
      Promise.all(kinds.map(([, name]) => getAnnotationCollection(name).then((c) => c.countDocuments({ erasableAt: null })))),
    ]);

  users.set(userCount);
  activeSessions.set(sessionCount);
  onlineUsers.set(onlineLeases.length);
  projects.set({ echoes_linked: 'true' }, linkedCount);
  projects.set({ echoes_linked: 'false' }, projectIds.length - linkedCount);
  for (const [window, days] of ACTIVE_USER_WINDOWS) {
    const since = now.getTime() - days * DAY_MS;
    activeUsers.set({ window }, logins.filter((l) => new Date(l.createdAt).getTime() >= since).length);
  }
  projectMembers.reset();
  for (const r of roles) projectMembers.set({ role: r.role }, r._count._all);
  annotations.reset();
  kinds.forEach(([kind], i) => annotations.set({ kind }, annotationCounts[i]));
  auditEvents.reset();
  for (const a of actions) auditEvents.set({ action: String(a._id) }, a.count);
}

/** Refreshes the scrape-time gauges and returns the Prometheus text exposition. */
export async function collectMetrics(): Promise<string> {
  const readiness = await getBackendReadinessReport();
  ready.set(readiness.ready ? 1 : 0);
  for (const [dependency, check] of Object.entries(readiness.checks)) {
    dependencyUp.set({ dependency }, check.ready ? 1 : 0);
  }

  try {
    await refreshUsageGauges();
  } catch (error) {
    // Keep serving the service-level metrics; usage gauges retain their previous values.
    console.error('Failed to refresh usage metrics:', error);
  }

  return metricsRegistry.metrics();
}
