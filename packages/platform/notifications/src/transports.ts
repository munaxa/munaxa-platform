import type {
  DeliveryResult,
  LoggerPort,
  NotificationChannel,
  NotificationMessage,
  NotificationTransportPort,
} from '@munaxa/interfaces';

/**
 * Transports the platform ships.
 *
 * Deliberately none that talk to a real provider: adding `@sendgrid/mail` here would put an
 * email vendor in the dependency tree of every Munaxa product, including the ones that send no
 * email. Products implement `NotificationTransportPort` against whatever they already use — it
 * is one method — and get retries, deduplication and the secret guard for free.
 */

/** Collects messages in memory. The one every test and every local environment wants. */
export class MemoryTransport implements NotificationTransportPort {
  readonly channel: NotificationChannel;
  readonly name: string;
  readonly sent: NotificationMessage[] = [];
  /** Set to fail the next N sends, to exercise a product's retry and fallback paths. */
  failures = 0;
  retryable = true;

  constructor(channel: NotificationChannel = 'email', name = 'memory') {
    this.channel = channel;
    this.name = name;
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    if (this.failures > 0) {
      this.failures--;
      return { delivered: false, error: 'simulated failure', retryable: this.retryable };
    }
    this.sent.push(message);
    return { delivered: true, providerMessageId: `mem-${this.sent.length}` };
  }

  last(): NotificationMessage | undefined {
    return this.sent.at(-1);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/**
 * Writes to the logger instead of sending.
 *
 * For development, and for the deployment that has not wired an email provider yet — the body is
 * logged so a developer can follow a reset link, which is exactly why this must never be
 * registered in production. `NODE_ENV` is not consulted here: the platform does not read the
 * environment behind a product's back, so wiring this is a deliberate act.
 */
export class LoggingTransport implements NotificationTransportPort {
  readonly channel: NotificationChannel;
  readonly name = 'logging';
  readonly #logger: LoggerPort;

  constructor(logger: LoggerPort, channel: NotificationChannel = 'email') {
    this.#logger = logger;
    this.channel = channel;
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    this.#logger.log('info', 'notification.logged', {
      channel: message.channel,
      templateId: message.templateId,
      subject: message.subject,
      body: message.body,
      recipient: message.recipient.email ?? message.recipient.phone ?? message.recipient.userId,
    });
    return { delivered: true, providerMessageId: message.id };
  }
}

/** Accepts and discards. For a channel a deployment has deliberately turned off. */
export class NullTransport implements NotificationTransportPort {
  readonly channel: NotificationChannel;
  readonly name = 'null';

  constructor(channel: NotificationChannel) {
    this.channel = channel;
  }

  async send(): Promise<DeliveryResult> {
    return { delivered: true };
  }
}

/**
 * Routes to one of several transports by tenant.
 *
 * Multi-tenant deployments frequently need this: a customer requires their own SMTP relay for
 * compliance, and everyone else uses the shared one.
 */
export class TenantRoutingTransport implements NotificationTransportPort {
  readonly channel: NotificationChannel;
  readonly name = 'tenant-routing';
  readonly #routes: ReadonlyMap<string, NotificationTransportPort>;
  readonly #fallback: NotificationTransportPort;

  constructor(
    channel: NotificationChannel,
    routes: ReadonlyMap<string, NotificationTransportPort>,
    fallback: NotificationTransportPort,
  ) {
    this.channel = channel;
    this.#routes = routes;
    this.#fallback = fallback;
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    const transport = this.#routes.get(message.tenantId) ?? this.#fallback;
    return transport.send(message);
  }
}
