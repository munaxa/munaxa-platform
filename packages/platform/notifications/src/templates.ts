import type {
  NotificationChannel,
  RenderedTemplate,
  TemplateRendererPort,
} from '@munaxa/interfaces';

/**
 * Notification templates.
 *
 * The renderer is deliberately not a general template engine. It substitutes `{{name}}`
 * placeholders and nothing else — no expressions, no property access, no loops — because the
 * variables come from user-controlled data and a template engine that evaluates expressions is a
 * remote code execution primitive one careless template away.
 *
 * HTML output is escaped by default. A template that genuinely needs raw markup uses the
 * `{{{name}}}` form, which is visible in review precisely because it is unusual.
 */
export interface NotificationTemplate {
  readonly id: string;
  readonly channels: readonly NotificationChannel[];
  readonly subject?: string;
  readonly body: string;
  readonly html?: string;
  /** Variables the template requires. Rendering fails if one is missing. */
  readonly required?: readonly string[];
}

export class TemplateRegistry implements TemplateRendererPort {
  readonly #templates = new Map<string, Map<string, NotificationTemplate>>();

  constructor(templates: readonly NotificationTemplate[] = [], locale = 'en') {
    for (const template of templates) this.register(template, locale);
  }

  register(template: NotificationTemplate, locale = 'en'): this {
    const byLocale = this.#templates.get(template.id) ?? new Map<string, NotificationTemplate>();
    byLocale.set(locale, template);
    this.#templates.set(template.id, byLocale);
    return this;
  }

  get(templateId: string, locale = 'en'): NotificationTemplate | undefined {
    const byLocale = this.#templates.get(templateId);
    if (!byLocale) return undefined;
    // Fall back to the base language, then to English: a missing translation must degrade to a
    // message in another language, never to no notification at all.
    return (
      byLocale.get(locale) ??
      byLocale.get(locale.split('-')[0] as string) ??
      byLocale.get('en') ??
      [...byLocale.values()][0]
    );
  }

  async render(
    templateId: string,
    variables: Readonly<Record<string, unknown>>,
    options: { locale?: string; channel?: NotificationChannel } = {},
  ): Promise<RenderedTemplate> {
    const template = this.get(templateId, options.locale ?? 'en');
    if (!template) throw new Error(`Unknown notification template ${templateId}`);

    if (options.channel && !template.channels.includes(options.channel)) {
      throw new Error(`Template ${templateId} has no ${options.channel} variant`);
    }

    const missing = (template.required ?? []).filter(
      (name) => variables[name] === undefined || variables[name] === null,
    );
    if (missing.length > 0) {
      // Failing loudly beats sending "Hello {{name}}" to a customer.
      throw new Error(`Template ${templateId} is missing variables: ${missing.join(', ')}`);
    }

    return {
      ...(template.subject === undefined
        ? {}
        : { subject: interpolate(template.subject, variables, false) }),
      body: interpolate(template.body, variables, false),
      ...(template.html === undefined ? {} : { html: interpolate(template.html, variables, true) }),
    };
  }
}

const TRIPLE = /\{\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}\}/g;
const DOUBLE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function interpolate(
  template: string,
  variables: Readonly<Record<string, unknown>>,
  html: boolean,
): string {
  return template
    .replace(TRIPLE, (_match, name: string) => stringify(variables[name]))
    .replace(DOUBLE, (_match, name: string) => {
      const value = stringify(variables[name]);
      return html ? escapeHtml(value) : value;
    });
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  // Objects are not rendered: a stringified object in a customer email is a data leak waiting
  // to happen, and `[object Object]` is a bug report.
  return '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * The security notifications every product owes its users.
 *
 * Each one exists because the user is the last line of defence: they are the only party who can
 * tell that a password change, a new device or an added second factor was not them. Note what is
 * absent — no template contains a password, a code, or a link that logs anyone in.
 */
export const SECURITY_TEMPLATES: readonly NotificationTemplate[] = [
  {
    id: 'security.password-changed',
    channels: ['email', 'in-app'],
    subject: 'Your {{productName}} password was changed',
    body: 'Your password was changed on {{changedAt}}. If this was not you, secure your account immediately at {{securityUrl}}.',
    required: ['productName', 'changedAt', 'securityUrl'],
  },
  {
    id: 'security.password-reset-requested',
    channels: ['email'],
    subject: 'Reset your {{productName}} password',
    // The link carries a single-use token; the message carries no password and never will.
    body: 'Use this link within {{expiresInMinutes}} minutes to choose a new password: {{resetUrl}}\n\nIf you did not ask for this, you can ignore this message — your password has not changed.',
    required: ['productName', 'resetUrl', 'expiresInMinutes'],
  },
  {
    id: 'security.new-device',
    channels: ['email', 'push'],
    subject: 'New sign-in to your {{productName}} account',
    body: 'A new sign-in was recorded from {{location}} on {{signedInAt}}. If this was not you, review your devices at {{securityUrl}}.',
    required: ['productName', 'location', 'signedInAt', 'securityUrl'],
  },
  {
    id: 'security.mfa-enabled',
    channels: ['email'],
    subject: 'Two-factor authentication enabled',
    body: 'Two-factor authentication was turned on for your {{productName}} account on {{changedAt}}.',
    required: ['productName', 'changedAt'],
  },
  {
    id: 'security.mfa-disabled',
    channels: ['email'],
    subject: 'Two-factor authentication disabled',
    body: 'Two-factor authentication was turned off for your {{productName}} account on {{changedAt}}. If this was not you, secure your account at {{securityUrl}}.',
    required: ['productName', 'changedAt', 'securityUrl'],
  },
  {
    id: 'security.account-locked',
    channels: ['email'],
    subject: 'Your {{productName}} account is temporarily locked',
    body: 'After several failed sign-in attempts, your account is locked until {{unlockAt}}. If this was not you, reset your password at {{securityUrl}}.',
    required: ['productName', 'unlockAt', 'securityUrl'],
  },
  {
    id: 'security.email-otp',
    channels: ['email'],
    subject: 'Your {{productName}} verification code',
    body: 'Your verification code is {{code}}. It expires in {{expiresInMinutes}} minutes. We will never ask you for this code.',
    required: ['productName', 'code', 'expiresInMinutes'],
  },
];
