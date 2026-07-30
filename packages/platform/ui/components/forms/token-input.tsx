'use client';

import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn.js';
import { Tag } from '../primitives/tag.js';
import { useFieldAria } from './field-context.js';
import { fieldBase } from './input.js';

export interface TokenInputLabels {
  placeholder?: string;
  /** Accessible name for each token's remove control. Receives the token text. */
  remove?: (token: string) => string;
  /** Announced when a token is rejected — duplicate, invalid, or over the cap. */
  rejected?: (token: string, reason: TokenRejection) => string;
}

export type TokenRejection = 'duplicate' | 'invalid' | 'limit';

export interface TokenInputProps {
  /** The committed tokens. Free text — this control has no option list. */
  value: string[];
  onChange: (value: string[]) => void;
  labels?: TokenInputLabels;
  /**
   * Characters that commit the token being typed, alongside Enter. Comma by default, because a
   * comma-separated list is how people already write these when there is no control at all.
   */
  delimiters?: string[];
  /** Reject a token, or normalise it. Return `null` to reject. */
  validate?: (token: string) => string | null;
  maxTokens?: number;
  allowDuplicates?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

const DEFAULT_LABELS: Required<TokenInputLabels> = {
  placeholder: 'Add…',
  remove: (token) => `Remove ${token}`,
  rejected: (token, reason) =>
    reason === 'duplicate'
      ? `${token} is already in the list.`
      : reason === 'limit'
        ? `${token} was not added: the list is full.`
        : `${token} is not valid.`,
};

/**
 * Free-text tokens: email addresses, tags, keywords — a list the user *writes* rather than picks.
 *
 * The deliberate omission is a suggestion list. It would be a third listbox implementation in this
 * package, and the platform already has the two that matter: `MultiSelect` for choosing several
 * things from a fixed list, and `Autocomplete` with `allowCustomValue` for searching a list while
 * still being able to type something that is not in it. This control is for the case neither covers
 * — where there is no list at all — and keeping it that way is what keeps it fifty lines instead of
 * two hundred.
 *
 * Keyboard: Enter or a delimiter commits, Backspace on an empty field removes the last token, and
 * each token's remove control is a real button. Pasting a delimited list commits every item at once,
 * which is the actual way a long list of addresses arrives.
 *
 * Rejections are announced through a live region rather than silently dropped — a token that simply
 * fails to appear reads as a broken control.
 */
export function TokenInput({
  value,
  onChange,
  labels,
  delimiters = [','],
  validate,
  maxTokens,
  allowDuplicates = false,
  disabled,
  readOnly,
  className,
  ...rest
}: TokenInputProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const [draft, setDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const aria = useFieldAria({ ...rest, disabled, readOnly });
  const groupLabelId = `${aria.id ?? generatedId}-tokens`;
  const locked = Boolean(aria.disabled) || Boolean(aria.readOnly);

  /** Commit one or more candidates, reporting the first rejection. */
  function commit(candidates: string[]): boolean {
    const accepted: string[] = [];
    let rejection: [string, TokenRejection] | null = null;

    for (const raw of candidates) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      const normalised = validate ? validate(trimmed) : trimmed;
      if (normalised === null) {
        rejection ??= [trimmed, 'invalid'];
        continue;
      }
      if (!allowDuplicates && [...value, ...accepted].includes(normalised)) {
        rejection ??= [normalised, 'duplicate'];
        continue;
      }
      if (maxTokens !== undefined && value.length + accepted.length >= maxTokens) {
        rejection ??= [normalised, 'limit'];
        continue;
      }
      accepted.push(normalised);
    }

    if (accepted.length > 0) onChange([...value, ...accepted]);
    setAnnouncement(rejection ? text.rejected(rejection[0], rejection[1]) : '');
    return rejection === null;
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
    setAnnouncement('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (locked) return;

    if (event.key === 'Enter' || delimiters.includes(event.key)) {
      // Enter inside a form would submit it; the user meant "commit this token".
      event.preventDefault();
      if (draft.trim() && commit([draft])) setDraft('');
      return;
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault();
      remove(value.length - 1);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    if (locked) return;
    const pasted = event.clipboardData.getData('text');
    const pattern = delimiters.map(escapeRegExp).concat(['\\n', '\\r', '\\t']).join('|');
    if (!new RegExp(pattern).test(pasted)) return;

    event.preventDefault();
    if (commit(pasted.split(new RegExp(pattern)))) setDraft('');
  }

  return (
    <div
      className={cn(
        fieldBase,
        'flex min-h-9 flex-wrap items-center gap-1 py-1',
        // The wrapper is not the focusable element, so it mirrors the input's focus ring itself.
        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        locked && 'cursor-not-allowed opacity-100',
        aria.disabled && 'opacity-50',
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {/* A plain group, not a listbox: these are committed values rather than a set being chosen
          from, and `role="listbox"` would promise arrow-key navigation that does not exist here. */}
      <span id={groupLabelId} className="sr-only">
        {value.length} selected
      </span>
      {value.map((token, index) => (
        <Tag
          key={`${token}-${index}`}
          size="sm"
          {...(locked ? {} : { onRemove: () => remove(index), removeLabel: text.remove(token) })}
        >
          {token}
        </Tag>
      ))}

      <input
        ref={inputRef}
        type="text"
        value={draft}
        placeholder={value.length === 0 ? text.placeholder : undefined}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        // Committing on blur avoids the commonest data-loss complaint: type a value, click Save,
        // and the half-entered token is thrown away with it.
        onBlur={() => {
          if (!locked && draft.trim() && commit([draft])) setDraft('');
        }}
        {...rest}
        {...aria}
        readOnly={aria.readOnly ?? false}
      />

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
