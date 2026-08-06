import type { Clock } from '@munaxa/types';
import type { CachePort, CounterPort, LockPort } from './cache.js';
import type {
  AuditRepositoryPort,
  AuditSinkPort,
  EventPublisherPort,
  LoggerPort,
  MetricsPort,
} from './observability.js';
import type {
  BreachRegistryPort,
  MfaEnrollmentStorePort,
  PasswordHistoryPort,
  UserDirectoryPort,
} from './identity.js';
import type { DeviceRegistryPort, SessionStorePort } from './sessions.js';
import type {
  ApiKeyStorePort,
  RefreshTokenStorePort,
  ResetTokenStorePort,
  SigningKeyPort,
} from './tokens.js';
import type { RoleAssignmentPort, RoleRepositoryPort } from './authorization.js';
import type { TemplateRendererPort } from './delivery.js';
import type {
  FeatureFlagPort,
  HttpClientPort,
  IdGeneratorPort,
  RandomPort,
  SecretsPort,
  TenantConfigPort,
} from './platform.js';
import { createToken } from './registry.js';

/**
 * The canonical token for every port.
 *
 * One place to look when wiring an application, and one place to see the whole seam surface of
 * the platform. NestJS products can pass these straight to `@Inject()`.
 */
export const PORTS = {
  clock: createToken<Clock>('platform.clock'),
  random: createToken<RandomPort>('platform.random'),
  ids: createToken<IdGeneratorPort>('platform.ids'),
  logger: createToken<LoggerPort>('platform.logger'),
  metrics: createToken<MetricsPort>('platform.metrics'),
  events: createToken<EventPublisherPort>('platform.events'),
  httpClient: createToken<HttpClientPort>('platform.httpClient'),

  cache: createToken<CachePort>('platform.cache'),
  counters: createToken<CounterPort>('platform.counters'),
  locks: createToken<LockPort>('platform.locks'),

  secrets: createToken<SecretsPort>('platform.secrets'),
  featureFlags: createToken<FeatureFlagPort>('platform.featureFlags'),
  tenantConfig: createToken<TenantConfigPort>('platform.tenantConfig'),

  auditSink: createToken<AuditSinkPort>('platform.auditSink'),
  auditRepository: createToken<AuditRepositoryPort>('platform.auditRepository'),

  userDirectory: createToken<UserDirectoryPort>('platform.userDirectory'),
  passwordHistory: createToken<PasswordHistoryPort>('platform.passwordHistory'),
  breachRegistry: createToken<BreachRegistryPort>('platform.breachRegistry'),
  mfaEnrollments: createToken<MfaEnrollmentStorePort>('platform.mfaEnrollments'),

  sessionStore: createToken<SessionStorePort>('platform.sessionStore'),
  deviceRegistry: createToken<DeviceRegistryPort>('platform.deviceRegistry'),

  refreshTokens: createToken<RefreshTokenStorePort>('platform.refreshTokens'),
  resetTokens: createToken<ResetTokenStorePort>('platform.resetTokens'),
  apiKeys: createToken<ApiKeyStorePort>('platform.apiKeys'),
  signingKeys: createToken<SigningKeyPort>('platform.signingKeys'),

  roles: createToken<RoleRepositoryPort>('platform.roles'),
  roleAssignments: createToken<RoleAssignmentPort>('platform.roleAssignments'),

  templates: createToken<TemplateRendererPort>('platform.templates'),
} as const;

/** The ports an authentication stack cannot start without. */
export const REQUIRED_AUTH_PORTS = [
  PORTS.clock,
  PORTS.userDirectory,
  PORTS.sessionStore,
  PORTS.refreshTokens,
  PORTS.auditSink,
] as const;
