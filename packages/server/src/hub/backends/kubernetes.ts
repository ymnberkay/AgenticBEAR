/**
 * Kubernetes session backend — one Pod + ClusterIP Service + path-based Ingress per user, all
 * named agb-session-<username> for easy tracking. The hub's ServiceAccount needs
 * create/get/list/delete/patch on pods, services and ingresses (see hub-rbac.yaml).
 *
 * Service and Ingress are created once and kept; the idle reaper deletes only the Pod. That
 * avoids ingress-controller reload churn and makes "reaped" deterministic for the client: the
 * Service has no endpoints → 503 → wake endpoint recreates the Pod.
 *
 * Workspaces: emptyDir by default. When AGB_SESSION_NFS_SERVER/PATH are set, /workspace is an
 * NFS mount with subPath=<username-slug>, so every user gets a private, reap-surviving
 * directory (<nfsPath>/<username>/) that git clones land in via AGB_WORKSPACES_ROOT.
 */
import type { CoreV1Api, NetworkingV1Api, V1Pod, V1Service, V1Ingress, V1Volume } from '@kubernetes/client-node';
import { config } from '../../config.js';
import { createLogger } from '../../utils/logger.js';
import {
  type SessionBackend,
  type SessionRecord,
  type SessionUser,
  sessionName,
  userHash,
  usernameSlug,
  publicBasePath,
} from './types.js';

const log = createLogger('hub:k8s');

const LABELS = {
  component: 'agb.dev/component',
  userHash: 'agb.dev/user-hash',
} as const;
const ANNOTATION_UID = 'agb.dev/user-id';
const ANNOTATION_USERNAME = 'agb.dev/username';

export class KubernetesBackend implements SessionBackend {
  private core!: CoreV1Api;
  private networking!: NetworkingV1Api;
  private image = config.hub.sessionImage;
  private ready: Promise<void> | undefined;

  private init(): Promise<void> {
    this.ready ??= (async () => {
      // Dynamic import keeps the k8s client out of standalone/session processes.
      const k8s = await import('@kubernetes/client-node');
      const kc = new k8s.KubeConfig();
      try {
        kc.loadFromCluster();
      } catch {
        kc.loadFromDefault(); // dev against kind/minikube
      }
      this.core = kc.makeApiClient(k8s.CoreV1Api);
      this.networking = kc.makeApiClient(k8s.NetworkingV1Api);
      if (!this.image) throw new Error('AGB_SESSION_IMAGE is required for the kubernetes backend');
    })();
    return this.ready;
  }

  private record(user: SessionUser): SessionRecord {
    const name = sessionName(user);
    return {
      uid: user.id,
      username: user.username,
      name,
      hash: userHash(user.id),
      internalUrl: `http://${name}.${config.hub.namespace}.svc:${config.hub.sessionPort}`,
      publicBaseUrl: publicBasePath(user.id),
    };
  }

  async start(user: SessionUser): Promise<SessionRecord> {
    await this.init();
    const record = this.record(user);
    await this.ensureService(user, record.name);
    await this.ensureIngress(user, record.name);
    await this.ensurePod(user, record.name);
    return record;
  }

  async stop(record: SessionRecord): Promise<void> {
    await this.init();
    try {
      await this.core.deleteNamespacedPod({ name: record.name, namespace: config.hub.namespace });
      log.info(`Deleted session pod ${record.name}`);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  async list(): Promise<SessionRecord[]> {
    await this.init();
    const pods = await this.core.listNamespacedPod({
      namespace: config.hub.namespace,
      labelSelector: `${LABELS.component}=session`,
    });
    const records: SessionRecord[] = [];
    for (const pod of pods.items) {
      const uid = pod.metadata?.annotations?.[ANNOTATION_UID];
      const username = pod.metadata?.annotations?.[ANNOTATION_USERNAME];
      if (uid && username) records.push(this.record({ id: uid, username }));
    }
    return records;
  }

  private async ensurePod(user: SessionUser, name: string): Promise<void> {
    const hub = config.hub;
    const slug = usernameSlug(user.username);
    // Volume names carry the username so mounts are attributable at a glance (kubectl describe).
    const dataVolume = `data-${slug}`.slice(0, 63);
    const workspaceVolume = `workspace-${slug}`.slice(0, 63);
    const nfsEnabled = Boolean(hub.nfsServer && hub.nfsPath);
    const workspaceSource: V1Volume = nfsEnabled
      ? { name: workspaceVolume, nfs: { server: hub.nfsServer, path: hub.nfsPath } }
      : { name: workspaceVolume, emptyDir: {} };

    const pod: V1Pod = {
      metadata: {
        name,
        labels: {
          'app.kubernetes.io/name': 'agenticbear',
          [LABELS.component]: 'session',
          [LABELS.userHash]: userHash(user.id),
        },
        annotations: { [ANNOTATION_UID]: user.id, [ANNOTATION_USERNAME]: user.username },
      },
      spec: {
        restartPolicy: 'Always',
        enableServiceLinks: false,
        securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000 },
        containers: [
          {
            name: 'session',
            image: this.image,
            imagePullPolicy: 'IfNotPresent',
            ports: [{ containerPort: hub.sessionPort, name: 'http' }],
            envFrom: [
              ...(hub.envFromConfigMap ? [{ configMapRef: { name: hub.envFromConfigMap } }] : []),
              ...(hub.envFromSecret ? [{ secretRef: { name: hub.envFromSecret } }] : []),
            ],
            env: [
              { name: 'AGB_MODE', value: 'session' },
              { name: 'AGB_SESSION_USER_ID', value: user.id },
              { name: 'PORT', value: String(hub.sessionPort) },
              { name: 'ISSUE_PULL_INTERVAL_MS', value: '0' },
              { name: 'HOME', value: '/data' },
              { name: 'AGB_WORKSPACES_ROOT', value: '/workspace' },
              { name: 'NODE_ENV', value: 'production' },
            ],
            volumeMounts: [
              { name: dataVolume, mountPath: '/data' },
              {
                name: workspaceVolume,
                mountPath: '/workspace',
                // Per-user directory on the shared export; kubelet creates it if missing.
                ...(nfsEnabled ? { subPath: slug } : {}),
              },
            ],
            readinessProbe: {
              httpGet: { path: '/api/health', port: hub.sessionPort },
              initialDelaySeconds: 3,
              periodSeconds: 5,
              failureThreshold: 6,
            },
            livenessProbe: {
              httpGet: { path: '/api/health', port: hub.sessionPort },
              initialDelaySeconds: 20,
              periodSeconds: 15,
              failureThreshold: 4,
            },
            resources: {
              requests: { cpu: hub.cpuRequest, memory: hub.memRequest },
              limits: { cpu: hub.cpuLimit, memory: hub.memLimit },
            },
          },
        ],
        volumes: [{ name: dataVolume, emptyDir: {} }, workspaceSource],
      },
    };
    try {
      await this.core.createNamespacedPod({ namespace: config.hub.namespace, body: pod });
      log.info(`Created session pod ${name} for ${user.username}${nfsEnabled ? ` (workspace: nfs ${hub.nfsServer}:${hub.nfsPath}/${slug})` : ''}`);
    } catch (err) {
      if (!isConflict(err)) throw err; // 409 = already running → adopt
    }
  }

  private async ensureService(user: SessionUser, name: string): Promise<void> {
    const svc: V1Service = {
      metadata: {
        name,
        labels: { 'app.kubernetes.io/name': 'agenticbear', [LABELS.component]: 'session' },
        annotations: { [ANNOTATION_UID]: user.id, [ANNOTATION_USERNAME]: user.username },
      },
      spec: {
        type: 'ClusterIP',
        selector: { [LABELS.userHash]: userHash(user.id) },
        ports: [{ name: 'http', port: config.hub.sessionPort, targetPort: config.hub.sessionPort }],
      },
    };
    try {
      await this.core.createNamespacedService({ namespace: config.hub.namespace, body: svc });
    } catch (err) {
      if (!isConflict(err)) throw err;
    }
  }

  private async ensureIngress(user: SessionUser, name: string): Promise<void> {
    const hub = config.hub;
    const ingress: V1Ingress = {
      metadata: {
        name,
        labels: { 'app.kubernetes.io/name': 'agenticbear', [LABELS.component]: 'session' },
        annotations: {
          [ANNOTATION_UID]: user.id,
          [ANNOTATION_USERNAME]: user.username,
          'nginx.ingress.kubernetes.io/use-regex': 'true',
          'nginx.ingress.kubernetes.io/rewrite-target': '/$2',
          // SSE: stream, never buffer, allow long-lived connections
          'nginx.ingress.kubernetes.io/proxy-buffering': 'off',
          'nginx.ingress.kubernetes.io/proxy-read-timeout': '3600',
          'nginx.ingress.kubernetes.io/proxy-send-timeout': '3600',
          'nginx.ingress.kubernetes.io/proxy-body-size': '32m',
        },
      },
      spec: {
        ingressClassName: hub.ingressClass,
        rules: [
          {
            ...(hub.publicHost ? { host: hub.publicHost } : {}),
            http: {
              paths: [
                {
                  path: `${hub.basePrefix}/${userHash(user.id)}(/|$)(.*)`,
                  pathType: 'ImplementationSpecific',
                  backend: { service: { name, port: { number: hub.sessionPort } } },
                },
              ],
            },
          },
        ],
      },
    };
    try {
      await this.networking.createNamespacedIngress({ namespace: config.hub.namespace, body: ingress });
    } catch (err) {
      if (!isConflict(err)) throw err;
    }
  }
}

function statusCode(err: unknown): number | undefined {
  const e = err as { code?: number; statusCode?: number; response?: { statusCode?: number } };
  return typeof e?.code === 'number' ? e.code : e?.statusCode ?? e?.response?.statusCode;
}
const isConflict = (err: unknown) => statusCode(err) === 409;
const isNotFound = (err: unknown) => statusCode(err) === 404;
