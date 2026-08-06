import type {
  AuditExporterPort,
  AuditRecord,
  ExportResult,
  HttpClientPort,
} from '@munaxa/interfaces';

/**
 * Exporters move records off the box that produced them.
 *
 * That is the whole point: a hash chain proves nobody edited a record in place, but it cannot
 * defend against an attacker who owns the database and rewrites the chain end to end. A copy
 * that left the perimeter within seconds can.
 */

/** Newline-delimited JSON — what every log pipeline and object store ingests without a schema. */
export class NdjsonExporter implements AuditExporterPort {
  readonly name = 'ndjson';
  readonly #write: (line: string) => void | Promise<void>;

  constructor(write: (line: string) => void | Promise<void>) {
    this.#write = write;
  }

  async export(records: AsyncIterable<AuditRecord> | Iterable<AuditRecord>): Promise<ExportResult> {
    let recordCount = 0;
    let bytes = 0;

    for await (const record of records as AsyncIterable<AuditRecord>) {
      const line = `${JSON.stringify(flatten(record))}\n`;
      await this.#write(line);
      recordCount++;
      bytes += Buffer.byteLength(line);
    }

    return { recordCount, bytes };
  }
}

/**
 * Posts batches to an HTTP collector (Splunk HEC, Elastic, a webhook).
 *
 * Failures throw rather than being swallowed: an export is a scheduled job, and a job that
 * silently exports nothing is the failure mode that gets discovered during an audit, months later.
 */
export interface WebhookExporterOptions {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly batchSize?: number;
  readonly timeoutMs?: number;
}

export class WebhookExporter implements AuditExporterPort {
  readonly name = 'webhook';
  readonly #http: HttpClientPort;
  readonly #options: WebhookExporterOptions;

  constructor(http: HttpClientPort, options: WebhookExporterOptions) {
    this.#http = http;
    this.#options = options;
  }

  async export(records: AsyncIterable<AuditRecord> | Iterable<AuditRecord>): Promise<ExportResult> {
    const batchSize = this.#options.batchSize ?? 100;
    let batch: unknown[] = [];
    let recordCount = 0;
    let bytes = 0;

    const flush = async (): Promise<void> => {
      if (batch.length === 0) return;
      const body = JSON.stringify({ records: batch });
      const response = await this.#http.request({
        method: 'POST',
        url: this.#options.url,
        headers: { 'content-type': 'application/json', ...this.#options.headers },
        body,
        timeoutMs: this.#options.timeoutMs ?? 10_000,
      });
      if (response.status >= 300) {
        throw new Error(`Audit export rejected with status ${response.status}`);
      }
      bytes += Buffer.byteLength(body);
      batch = [];
    };

    for await (const record of records as AsyncIterable<AuditRecord>) {
      batch.push(flatten(record));
      recordCount++;
      if (batch.length >= batchSize) await flush();
    }
    await flush();

    return { recordCount, bytes, location: this.#options.url };
  }
}

/**
 * CSV, for the compliance request that arrives as a spreadsheet.
 *
 * Every field is quoted and every leading `=`, `+`, `-` or `@` is prefixed, because a cell that
 * begins with one of those is a formula in Excel and Sheets — an audit trail carrying user-typed
 * strings is a formula-injection vector into whoever opens the export.
 */
export class CsvExporter implements AuditExporterPort {
  readonly name = 'csv';
  readonly #write: (line: string) => void | Promise<void>;

  static readonly COLUMNS = [
    'id',
    'sequence',
    'recordedAt',
    'occurredAt',
    'tenantId',
    'event',
    'outcome',
    'severity',
    'actorId',
    'actorKind',
    'targetId',
    'targetType',
    'correlationId',
    'ipAddress',
  ] as const;

  constructor(write: (line: string) => void | Promise<void>) {
    this.#write = write;
  }

  async export(records: AsyncIterable<AuditRecord> | Iterable<AuditRecord>): Promise<ExportResult> {
    await this.#write(`${CsvExporter.COLUMNS.join(',')}\n`);
    let recordCount = 0;

    for await (const record of records as AsyncIterable<AuditRecord>) {
      const flat = flatten(record);
      const line = CsvExporter.COLUMNS.map((column) => csvCell(flat[column])).join(',');
      await this.#write(`${line}\n`);
      recordCount++;
    }

    return { recordCount };
  }
}

function flatten(record: AuditRecord): Record<string, unknown> {
  const event = record.event;
  return {
    id: record.id,
    sequence: record.sequence,
    recordedAt: new Date(record.recordedAt).toISOString(),
    occurredAt: new Date(event.occurredAt).toISOString(),
    tenantId: event.tenantId,
    event: event.name,
    outcome: event.outcome,
    severity: event.severity,
    actorId: event.actor?.id ?? null,
    actorKind: event.actor?.kind ?? null,
    targetId: event.target?.id ?? null,
    targetType: event.target?.type ?? null,
    correlationId: event.correlationId,
    ipAddress: event.source?.ipAddress ?? null,
    payload: event.payload ?? null,
    hash: record.hash,
    previousHash: record.previousHash,
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  // `flatten` produces only primitives, but the parameter is `unknown`: anything else that
  // reaches here renders as JSON rather than as `[object Object]`.
  const text = typeof value === 'string' ? value : renderCell(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}

function renderCell(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  return JSON.stringify(value) ?? '';
}
