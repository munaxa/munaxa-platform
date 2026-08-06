import type {
  CachePort,
  DeliveryResult,
  LoggerPort,
  NotificationChannel,
  NotificationMessage,
  NotificationRecipient,
  NotificationTransportPort,
  TemplateRendererPort,
} from '@munaxa/interfaces';
import { systemClock, type Clock, type DurationMs, type TenantId } from '@munaxa/types';
import { prefixedId } from '@munaxa/crypto';

/**
 * Notification delivery.
 *
 * The platform's stake in this is narrow and specific: security notifications must actually
 * arrive, and must never carry a credential. Everything else — which provider, what the message
 * looks like, when to batch — belongs to the product.
 *
 * The guard is the part worth reading. Before anything is handed to a transport, the payload is
 * checked for credential-shaped fields, and a message carrying one is refused outright rather
 * than sent with the field stripped. Silently sending a mangled email hides the bug; failing
 * makes it a test failure the first time it is written.
 */
export interface NotificationServiceOptions {
  readonly transports: readonly NotificationTransportPort[];
  readonly templates?: TemplateRendererPort;
  readonly clock?: Clock;
  readonly logger?: LoggerPort;
  /** Attempts per message, including the first. */
  readonly maxAttempts?: number;
  /** Base delay for exponential backoff between attempts. */
  readonly retryDelay?: DurationMs;
  /** Suppress an identical message to the same recipient within this window. */
  readonly dedupeWindow?: DurationMs;
  /**
   * Where the deduplication claim lives. Wire the shared cache in any deployment with more than
   * one replica: without it each instance suppresses only its *own* repeats, so a user gets one
   * copy of the same notice per pod — which is the failure mode people describe as "the retry
   * loop is broken" long before they find the real cause.
   */
  readonly dedupeStore?: CachePort;
  readonly onEvent?: (event: NotificationEvent) => void | Promise<void>;
}

export interface NotificationEvent {
  readonly type: 'sent' | 'failed' | 'suppressed' | 'rejected';
  readonly message: NotificationMessage;
  readonly transport?: string;
  readonly error?: string;
  readonly attempts?: number;
}

export interface SendInput {
  readonly tenantId: TenantId;
  readonly channel: NotificationChannel;
  readonly recipient: NotificationRecipient;
  readonly templateId?: string;
  readonly variables?: Readonly<Record<string, unknown>>;
  readonly subject?: string;
  readonly body?: string;
  readonly html?: string;
  readonly correlationId?: string;
  readonly priority?: NotificationMessage['priority'];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Fields that must never appear in a notification payload.
 *
 * "No emailed passwords" is a platform rule, not a guideline, and this is where it is enforced.
 * One-time codes are the deliberate exception: an emailed OTP *is* the delivery mechanism, so
 * `code` is permitted while `password` never is.
 */
const FORBIDDEN_FIELDS = [
  'password',
  'newpassword',
  'temporarypassword',
  'passphrase',
  'passwordhash',
  'refreshtoken',
  'accesstoken',
  'apikey',
  'apisecret',
  'clientsecret',
  'privatekey',
  'recoverycodes',
  'totpsecret',
  'mfasecret',
];

export class SecretLeakError extends Error {
  constructor(readonly field: string) {
    super(
      `Refusing to send a notification containing "${field}". The platform never delivers credentials — send a single-use link instead.`,
    );
    this.name = 'SecretLeakError';
  }
}

export class NotificationService {
  readonly #transports = new Map<NotificationChannel, NotificationTransportPort[]>();
  readonly #templates: TemplateRendererPort | undefined;
  readonly #clock: Clock;
  readonly #logger: LoggerPort | undefined;
  readonly #maxAttempts: number;
  readonly #retryDelay: DurationMs;
  readonly #dedupeWindow: DurationMs;
  readonly #onEvent: NotificationServiceOptions['onEvent'];
  readonly #dedupeStore: CachePort | undefined;
  readonly #recentlySent = new Map<string, number>();

  constructor(options: NotificationServiceOptions) {
    for (const transport of options.transports) this.registerTransport(transport);
    this.#templates = options.templates;
    this.#clock = options.clock ?? systemClock;
    this.#logger = options.logger;
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#retryDelay = options.retryDelay ?? 250;
    this.#dedupeWindow = options.dedupeWindow ?? 60_000;
    this.#dedupeStore = options.dedupeStore;
    this.#onEvent = options.onEvent;
  }

  registerTransport(transport: NotificationTransportPort): this {
    const existing = this.#transports.get(transport.channel) ?? [];
    existing.push(transport);
    this.#transports.set(transport.channel, existing);
    return this;
  }

  /**
   * Whether deduplication holds across replicas. Worth logging at startup — the difference is
   * one notice per user and one notice per user per instance.
   */
  get distributed(): boolean {
    return this.#dedupeStore !== undefined;
  }

  /** Channels with at least one registered transport. */
  get channels(): readonly NotificationChannel[] {
    return [...this.#transports.keys()];
  }

  async send(input: SendInput): Promise<DeliveryResult> {
    this.#assertNoSecrets(input.variables ?? {});
    this.#assertNoSecrets(input.metadata ?? {});

    const rendered = input.templateId
      ? await this.#render(input)
      : { subject: input.subject, body: input.body ?? '', html: input.html };

    const message: NotificationMessage = {
      id: prefixedId('ntf', this.#clock.now()),
      tenantId: input.tenantId,
      channel: input.channel,
      recipient: input.recipient,
      body: rendered.body,
      priority: input.priority ?? 'normal',
      ...(rendered.subject === undefined ? {} : { subject: rendered.subject }),
      ...(rendered.html === undefined ? {} : { html: rendered.html }),
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
      ...(input.templateId === undefined ? {} : { templateId: input.templateId }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    };

    // Claimed *before* delivery, not remembered after it. Two replicas handed the same event
    // reach here at the same moment; remembering afterwards means both have already sent by the
    // time either remembers. The claim is released below if delivery ultimately fails, so a
    // genuine retry is not suppressed by its own first attempt.
    if (!(await this.#claim(message))) {
      await this.#onEvent?.({ type: 'suppressed', message });
      return { delivered: false, error: 'suppressed-duplicate' };
    }

    const transports = this.#transports.get(input.channel) ?? [];
    if (transports.length === 0) {
      const error = `No transport registered for channel ${input.channel}`;
      await this.#release(message);
      await this.#onEvent?.({ type: 'failed', message, error });
      // A missing transport for a critical security notification is an operational failure, not
      // a message to drop quietly: the user would never learn their password had changed.
      if (message.priority === 'critical') throw new Error(error);
      return { delivered: false, error };
    }

    const result = await this.#deliver(message, transports);
    if (!result.delivered) await this.#release(message);
    return result;
  }

  async #deliver(
    message: NotificationMessage,
    transports: readonly NotificationTransportPort[],
  ): Promise<DeliveryResult> {
    let lastError: string | undefined;

    // Transports are tried in registration order, so a product can list a primary and a fallback.
    for (const transport of transports) {
      for (let attempt = 1; attempt <= this.#maxAttempts; attempt++) {
        try {
          const result = await transport.send(message);
          if (result.delivered) {
            await this.#onEvent?.({
              type: 'sent',
              message,
              transport: transport.name,
              attempts: attempt,
            });
            return result;
          }
          lastError = result.error ?? 'not delivered';
          // A permanent failure — a malformed address — will not succeed on a retry, and retrying
          // it costs the provider's reputation as much as ours.
          if (result.retryable === false) break;
        } catch (error) {
          lastError = (error as Error).message;
        }

        if (attempt < this.#maxAttempts) await sleep(this.#retryDelay * 2 ** (attempt - 1));
      }
    }

    this.#logger?.log('warn', 'notification.failed', {
      channel: message.channel,
      templateId: message.templateId,
      error: lastError,
    });
    await this.#onEvent?.({
      type: 'failed',
      message,
      ...(lastError === undefined ? {} : { error: lastError }),
    });
    return { delivered: false, ...(lastError === undefined ? {} : { error: lastError }) };
  }

  async #render(input: SendInput) {
    if (!this.#templates) throw new Error('No template renderer is configured');
    return this.#templates.render(input.templateId as string, input.variables ?? {}, {
      ...(input.recipient.locale === undefined ? {} : { locale: input.recipient.locale }),
      channel: input.channel,
    });
  }

  #assertNoSecrets(payload: Readonly<Record<string, unknown>>): void {
    for (const key of Object.keys(payload)) {
      if (FORBIDDEN_FIELDS.includes(key.toLowerCase().replaceAll(/[^a-z0-9]/g, ''))) {
        throw new SecretLeakError(key);
      }
    }
  }

  #dedupeKey(message: NotificationMessage): string {
    const recipient =
      message.recipient.userId ?? message.recipient.email ?? message.recipient.phone ?? 'unknown';
    return `${message.tenantId}:${message.channel}:${recipient}:${message.templateId ?? message.body}`;
  }

  /**
   * Claim the right to send this message. Exactly one caller across the fleet is told `true`.
   *
   * Critical security notices are never suppressed: three password-change emails are a nuisance,
   * one missing password-change email is an unnoticed account takeover.
   */
  async #claim(message: NotificationMessage): Promise<boolean> {
    if (message.priority === 'critical' || this.#dedupeWindow <= 0) return true;

    const key = this.#dedupeKey(message);
    const now = this.#clock.now();
    if (this.#dedupeStore) {
      return this.#dedupeStore.setIfAbsent(`notify:dedupe:${key}`, now, {
        ttl: this.#dedupeWindow,
      });
    }

    // Single-process fallback. Correct for one instance, and `distributed` says so for the rest.
    const sentAt = this.#recentlySent.get(key);
    if (sentAt !== undefined && now - sentAt < this.#dedupeWindow) return false;
    this.#recentlySent.set(key, now);
    if (this.#recentlySent.size > 10_000) {
      for (const [candidate, at] of this.#recentlySent) {
        if (now - at >= this.#dedupeWindow) this.#recentlySent.delete(candidate);
      }
    }
    return true;
  }

  /** Give the claim back so a later attempt is not suppressed by this failed one. */
  async #release(message: NotificationMessage): Promise<void> {
    if (message.priority === 'critical' || this.#dedupeWindow <= 0) return;
    const key = this.#dedupeKey(message);
    if (this.#dedupeStore) await this.#dedupeStore.delete(`notify:dedupe:${key}`);
    else this.#recentlySent.delete(key);
  }
}

function sleep(ms: DurationMs): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();
  });
}
