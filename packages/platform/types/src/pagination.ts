/**
 * Cursor pagination.
 *
 * Audit trails and session lists are append-heavy and read by page; offset pagination on those
 * tables drifts (rows shift under the reader) and degrades. Cursors do neither, so the platform
 * exposes only cursors.
 */
export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
  /** Total count when the store can produce one cheaply. Never assume it is present. */
  readonly total?: number;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

/** Clamp a caller-supplied limit. Unbounded page sizes are a denial-of-service knob. */
export function normalizePageRequest(request: Partial<PageRequest> = {}): PageRequest {
  const requested = request.limit ?? DEFAULT_PAGE_SIZE;
  const limit = Math.min(Math.max(Math.trunc(requested) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  return request.cursor === undefined ? { limit } : { limit, cursor: request.cursor };
}

export function emptyPage<T>(): Page<T> {
  return { items: [] };
}
