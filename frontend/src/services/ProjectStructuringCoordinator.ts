import {
  ProjectStructuringApiError,
  ProjectStructuringService,
  type StructuringLockResponse,
  type StructuringStartPayload,
} from './ProjectStructuringService';

export interface StructuringDrainSignal {
  projectId: string;
  operationType?: string;
  operationContext?: Record<string, unknown>;
  drainTimeoutMs?: number;
  drainDeadlineAt?: string | null;
}

export interface StructuringDrainingNotifier {
  notifyDrainingStart?(signal: StructuringDrainSignal): Promise<boolean | void> | boolean | void;
  notifyDrainingStop?(signal: StructuringDrainSignal): Promise<boolean | void> | boolean | void;
}

export interface RunExclusiveStructuringOptions extends StructuringStartPayload {
  acquireTimeoutMs?: number;
  acquireHeartbeatIntervalMs?: number;
  operationHeartbeatIntervalMs?: number;
  drainingNotifier?: StructuringDrainingNotifier;
  onStateChange?: (lock: StructuringLockResponse) => void;
}

export interface ExclusiveStructuringLease {
  projectId: string;
  fencingToken: number;
  state: 'exclusive';
  heartbeatExpiresAt: string;
}

export interface HeldStructuringLock extends ExclusiveStructuringLease {
  release: () => Promise<void>;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export class ProjectStructuringCoordinator {
  constructor(
    private readonly projectId: string,
    private readonly structuringService: ProjectStructuringService,
  ) {}

  async runExclusiveOperation<T>(
    options: RunExclusiveStructuringOptions,
    operation: (lease: ExclusiveStructuringLease) => Promise<T>,
  ): Promise<T> {
    const heldLock = await this.acquireExclusiveLock(options);
    let primaryError: unknown = null;

    try {
      return await operation({
        projectId: heldLock.projectId,
        fencingToken: heldLock.fencingToken,
        state: 'exclusive',
        heartbeatExpiresAt: heldLock.heartbeatExpiresAt,
      });
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      try {
        await heldLock.release();
      } catch (error) {
        if (primaryError) {
          console.error('Failed to release structuring lock after operation error:', error);
        } else {
          throw error;
        }
      }
    }
  }

  async acquireExclusiveLock(options: RunExclusiveStructuringOptions): Promise<HeldStructuringLock> {
    const signal: StructuringDrainSignal = {
      projectId: this.projectId,
      operationType: options.operationType,
      operationContext: options.operationContext,
      drainTimeoutMs: options.acquireTimeoutMs ?? 45_000,
    };
    const acquireHeartbeatIntervalMs = options.acquireHeartbeatIntervalMs ?? 3_000;
    const operationHeartbeatIntervalMs = options.operationHeartbeatIntervalMs ?? 10_000;
    const acquireTimeoutMs = options.acquireTimeoutMs ?? 45_000;

    let lock = await this.structuringService.startStructuring({
      operationType: options.operationType,
      operationContext: options.operationContext,
    });
    options.onStateChange?.(lock);

    let notifierStarted = false;
    if (lock.state === 'draining' && options.drainingNotifier?.notifyDrainingStart) {
      signal.drainDeadlineAt = lock.drainDeadlineAt ?? null;
      await options.drainingNotifier.notifyDrainingStart(signal);
      notifierStarted = true;
    }

    const deadline = Date.now() + acquireTimeoutMs;
    while (lock.state !== 'exclusive') {
      if (Date.now() >= deadline) {
        throw new Error(`Timed out while waiting for project ${this.projectId} to reach exclusive structuring state`);
      }

      await delay(acquireHeartbeatIntervalMs);
      lock = await this.structuringService.heartbeatStructuring({ fencingToken: lock.fencingToken });
      options.onStateChange?.(lock);
    }

    const keepAlive = this.startHeartbeatLoop(lock.fencingToken, operationHeartbeatIntervalMs, options.onStateChange);

    return {
      projectId: lock.projectId,
      fencingToken: lock.fencingToken,
      state: 'exclusive',
      heartbeatExpiresAt: lock.heartbeatExpiresAt,
      release: async () => {
      keepAlive.stop();

        if (notifierStarted && options.drainingNotifier?.notifyDrainingStop) {
          try {
            await options.drainingNotifier.notifyDrainingStop(signal);
          } catch (error) {
            console.error('Failed to emit structuring draining stop notification:', error);
          }
        }

        await this.structuringService.stopStructuring({ fencingToken: lock.fencingToken });
      },
    };
  }

  private startHeartbeatLoop(
    fencingToken: number,
    intervalMs: number,
    onStateChange?: (lock: StructuringLockResponse) => void,
  ) {
    let stopped = false;
    let inFlight = false;
    const timerId = window.setInterval(() => {
      if (stopped || inFlight) {
        return;
      }

      inFlight = true;
      void this.structuringService
        .heartbeatStructuring({ fencingToken })
        .then((lock) => {
          onStateChange?.(lock);
        })
        .catch((error) => {
          if (
            stopped ||
            (error instanceof ProjectStructuringApiError &&
              (error.status === 404 || error.status === 410))
          ) {
            return;
          }

          console.error('Structuring heartbeat failed while operation was running:', error);
        })
        .finally(() => {
          inFlight = false;
        });
    }, intervalMs);

    return {
      stop() {
        stopped = true;
        window.clearInterval(timerId);
      },
    };
  }
}