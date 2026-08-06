import type { TenantId, UserId } from '@munaxa/types';

export type NotificationChannel = 'email' | 'sms' | 'push' | 'in-app';

export interface NotificationRecipient {
  readonly userId?: UserId;
  readonly email?: string;
  readonly phone?: string;
  /** Push tokens, one per registered device. */
  readonly deviceTokens?: readonly string[];
  readonly locale?: string;
  readonly timeZone?: string;
}

export interface NotificationMessage {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly channel: NotificationChannel;
  readonly recipient: NotificationRecipient;
  readonly subject?: string;
  readonly body: string;
  readonly html?: string;
  /** Correlates the notification with the security event that caused it. */
  readonly correlationId?: string;
  readonly templateId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Security notifications must arrive; marketing may be dropped under pressure. */
  readonly priority: 'critical' | 'normal' | 'low';
}

export interface DeliveryResult {
  readonly delivered: boolean;
  readonly providerMessageId?: string;
  readonly error?: string;
  /** Set when the failure is worth retrying (timeouts, 5xx) rather than permanent (bad address). */
  readonly retryable?: boolean;
}

/** One transport for one channel. Products register the ones they have credentials for. */
export interface NotificationTransportPort {
  readonly channel: NotificationChannel;
  readonly name: string;
  send(message: NotificationMessage): Promise<DeliveryResult>;
  /** Cheap pre-flight check used by health endpoints. */
  healthy?(): Promise<boolean>;
}

export interface TemplateRendererPort {
  render(
    templateId: string,
    variables: Readonly<Record<string, unknown>>,
    options?: { locale?: string; channel?: NotificationChannel },
  ): Promise<RenderedTemplate>;
}

export interface RenderedTemplate {
  readonly subject?: string;
  readonly body: string;
  readonly html?: string;
}
