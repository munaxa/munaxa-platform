'use client';

import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { Upload } from '../../../icons/index.js';

export type FileRejectionReason = 'type' | 'size' | 'count';

export interface FileRejection {
  file: File;
  reason: FileRejectionReason;
}

export interface DropzoneLabels {
  prompt?: ReactNode;
  browse?: string;
  hint?: ReactNode;
  rejected?: (rejections: FileRejection[]) => string;
}

const DEFAULT_LABELS = {
  prompt: 'Drop files here',
  browse: 'Browse files',
  rejected: (rejections: FileRejection[]) => {
    const first = rejections[0];
    if (!first) return '';
    const reason =
      first.reason === 'type'
        ? 'is not an accepted type'
        : first.reason === 'size'
          ? 'is too large'
          : 'exceeds the number of files allowed';
    return rejections.length === 1
      ? `${first.file.name} ${reason}.`
      : `${first.file.name} ${reason}, and ${rejections.length - 1} more were rejected.`;
  },
} satisfies Partial<DropzoneLabels>;

export interface DropzoneProps {
  /**
   * Receives the raw `File` objects and nothing else.
   *
   * The dropzone never uploads. It has no endpoint, no progress and no opinion about storage —
   * whether these go to S3, to a signed URL, to IndexedDB or straight into a form is the product's
   * business, and a component that assumed one of them would be unusable for the others.
   */
  onFiles: (files: File[]) => void;
  /** Rejected files, with the reason. Fired alongside `onFiles` when a drop is mixed. */
  onReject?: (rejections: FileRejection[]) => void;
  /** MIME types or extensions, as the `accept` attribute takes them. */
  accept?: string;
  multiple?: boolean;
  /** Per-file cap in bytes. */
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
  labels?: DropzoneLabels;
  /** Replaces the default prompt entirely. */
  children?: ReactNode;
  className?: string;
}

/**
 * A drop target that also opens a file picker.
 *
 * **It is a button, not a div with a click handler.** A dropzone is the classic component that
 * works only with a pointer: drag is inherently a pointer gesture, so the keyboard path has to be
 * a real, focusable, activatable control or there is no way in at all. Here the whole surface *is*
 * a `<button>`, with a visually-hidden file input behind it — so Tab reaches it, Enter and Space
 * open the picker, and the drag is an enhancement on top rather than the only route.
 *
 * **Rejections are announced.** A file that is silently ignored because it is 4 MB too large reads
 * as a broken control; the reason goes into a live region.
 */
export function Dropzone({
  onFiles,
  onReject,
  accept,
  multiple = true,
  maxSize,
  maxFiles,
  disabled = false,
  labels,
  children,
  className,
}: DropzoneProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const describedBy = useId();

  /** `depth` rather than a boolean: dragging over a child fires `dragleave` on the parent. */
  const depth = useRef(0);

  function accepts(file: File): FileRejectionReason | null {
    if (maxSize !== undefined && file.size > maxSize) return 'size';
    if (!accept) return null;
    const patterns = accept.split(',').map((value) => value.trim().toLowerCase());
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    const ok = patterns.some((pattern) =>
      pattern.startsWith('.')
        ? name.endsWith(pattern)
        : pattern.endsWith('/*')
          ? type.startsWith(pattern.slice(0, -1))
          : type === pattern,
    );
    return ok ? null : 'type';
  }

  function handle(list: FileList | null) {
    if (!list || disabled) return;
    const incoming = [...list];
    const accepted: File[] = [];
    const rejections: FileRejection[] = [];

    for (const file of incoming) {
      const reason = accepts(file);
      if (reason) rejections.push({ file, reason });
      else if (maxFiles !== undefined && accepted.length >= maxFiles) {
        rejections.push({ file, reason: 'count' });
      } else accepted.push(file);
    }

    if (accepted.length > 0) onFiles(accepted);
    if (rejections.length > 0) {
      onReject?.(rejections);
      setAnnouncement((text.rejected ?? DEFAULT_LABELS.rejected)(rejections));
    } else {
      setAnnouncement('');
    }
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    handle(event.dataTransfer.files);
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-describedby={describedBy}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          depth.current += 1;
          setOver(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          depth.current -= 1;
          if (depth.current <= 0) setOver(false);
        }}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border',
          'px-6 py-8 text-center text-sm transition-colors',
          'hover:border-primary/60 hover:bg-muted/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          over && 'border-primary bg-primary/5',
        )}
      >
        {children ?? (
          <>
            <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium text-foreground">{text.prompt}</span>
            <span className="text-primary-strong underline">{text.browse}</span>
          </>
        )}
      </button>

      <span id={describedBy} className="mt-1 block text-xs text-muted-foreground">
        {text.hint}
      </span>

      <input
        ref={inputRef}
        type="file"
        // The `hidden` *attribute*, not a utility class. The button above is the accessible control;
        // leaving this input in the accessibility tree would announce a second, unlabelled file
        // control for the same thing. It has to be the attribute rather than `class="hidden"`
        // because the platform's semantics must not depend on a stylesheet having loaded — and a
        // programmatic `.click()` still opens the picker on a hidden input, which is what makes the
        // whole pattern work.
        hidden
        // `aria-hidden` as well as `hidden`, and neither is redundant. The attribute is what a
        // browser acts on; the ARIA is what keeps the input out of the accessibility tree even
        // where `hidden`'s user-agent style has not been applied — a stylesheet is not something
        // the platform's semantics should depend on. `tabIndex={-1}` keeps it untabbable, which is
        // what makes hiding it from assistive technology legitimate rather than a trap.
        aria-hidden="true"
        tabIndex={-1}
        multiple={multiple}
        disabled={disabled}
        {...(accept === undefined ? {} : { accept })}
        onChange={(event) => {
          handle(event.target.files);
          // Cleared so choosing the same file twice in a row still fires a change.
          event.target.value = '';
        }}
      />

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

/** Human-readable file size. Binary units, because that is what a file browser shows. */
export function formatFileSize(bytes: number, locale?: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}
