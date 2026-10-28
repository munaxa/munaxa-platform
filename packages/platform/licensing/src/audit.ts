/**
 * The licensing audit vocabulary.
 *
 * One spelling for every licensing action anywhere in the ecosystem, so a question like "who
 * suspended this customer, and was it reactivated?" has the same answer whether it is asked of the
 * central service or of a product's own trail. Each product records these through its own audit
 * writer; this module owns only the names and the shape of what is attested.
 */
export const LicensingAuditAction = {
  CUSTOMER_CREATED: 'licensing.customer.created',
  CUSTOMER_UPDATED: 'licensing.customer.updated',
  TENANT_LINKED: 'licensing.customer.tenant_linked',
  PLAN_PUBLISHED: 'licensing.plan.published',
  PLAN_RETIRED: 'licensing.plan.retired',
  SUBSCRIPTION_CREATED: 'licensing.subscription.created',
  SUBSCRIPTION_TRANSITIONED: 'licensing.subscription.transitioned',
  SUBSCRIPTION_PLAN_CHANGED: 'licensing.subscription.plan_changed',
  SUBSCRIPTION_OVERRIDE_SET: 'licensing.subscription.override_set',
  LICENSE_ISSUED: 'licensing.license.issued',
  LICENSE_REVOKED: 'licensing.license.revoked',
  INSTALLATION_REGISTERED: 'licensing.installation.registered',
  INSTALLATION_REACTIVATED: 'licensing.installation.reactivated',
  USAGE_REPORTED: 'licensing.usage.reported',
  /** A product refused an operation on entitlement grounds. Recorded by the product. */
  ENTITLEMENT_DENIED: 'licensing.entitlement.denied',
  /** A product rejected a licence file. Recorded by the product. */
  LICENSE_REJECTED: 'licensing.license.rejected',
} as const;
export type LicensingAuditAction = (typeof LicensingAuditAction)[keyof typeof LicensingAuditAction];

/** Every licensing audit record carries this subject, so records join across systems. */
export interface LicensingAuditSubject {
  readonly customerId: string | null;
  readonly tenantId: string | null;
  readonly product: string | null;
  readonly subscriptionId?: string;
  readonly licenseId?: string;
  readonly installationId?: string;
}
