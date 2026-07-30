'use client';

import { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { Check, ChevronsUpDown } from '../../icons/index.js';
import { Avatar, AvatarFallback, AvatarImage } from '../components/data-display/avatar.js';
import { Badge } from '../components/primitives/badge.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/overlays/dropdown-menu.js';
import { ScrollArea } from '../components/layout/separator.js';

/**
 * Shell menus, composed from the foundation primitives.
 *
 * None of these implement interaction. Opening, closing, roving focus, typeahead, Escape,
 * outside-dismissal and focus restoration are all `DropdownMenu`'s, which is Radix's — so a user
 * menu, an organisation switcher and a notification menu behave identically because they *are* the
 * same mechanism, not three that were made to match.
 *
 * They take resolved data and callbacks. Who the user is, which organisations they may switch to
 * and what a notification means are product questions.
 */

/** Trigger styling shared by the shell's menu buttons, so they sit as one row in the top bar. */
const triggerClass = cn(
  'flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-start transition-colors',
  'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'data-[state=open]:bg-accent',
);

export interface UserMenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

export interface UserMenuProps {
  name: string;
  /** Secondary line — a role, an email, a tenant. */
  description?: string;
  avatarUrl?: string;
  /** Falls back to the first letter of `name`. */
  initials?: string;
  actions: UserMenuAction[];
  /** Accessible name for the trigger, e.g. "Account menu". */
  label?: string;
  className?: string;
}

/** The account menu in the top bar: who is signed in, and what they can do about it. */
export function UserMenu({
  name,
  description,
  avatarUrl,
  initials,
  actions,
  label = 'Account menu',
  className,
}: UserMenuProps) {
  const fallback = initials ?? name.charAt(0).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={label} className={cn(triggerClass, className)}>
        <Avatar size="sm">
          {avatarUrl ? <AvatarImage src={avatarUrl} /> : null}
          <AvatarFallback>{fallback}</AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 leading-tight sm:block">
          <span className="block truncate text-xs font-medium">{name}</span>
          {description ? (
            <span className="block truncate text-[10px] text-muted-foreground">{description}</span>
          ) : null}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-foreground">{name}</span>
          {description ? <span className="block truncate">{description}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            onSelect={action.onSelect}
            {...(action.destructive ? { destructive: true } : {})}
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface Organization {
  id: string;
  name: string;
  /** Secondary line — a plan, a region, a tenant id. */
  description?: string;
  logoUrl?: string;
}

export interface OrganizationSwitcherProps {
  organizations: Organization[];
  currentId: string;
  onSelect: (id: string) => void;
  label?: string;
  /** Rendered under the list — "Create organisation", "Manage organisations". */
  footer?: ReactNode;
  className?: string;
}

/**
 * Switches between the organisations, tenants or workspaces a user belongs to.
 *
 * The current one is marked with `aria-checked` on a `menuitemradio`, not merely a tick glyph, so
 * the selection is announced rather than only shown. The list scrolls past eight or so entries;
 * a user with fifty organisations should not get a menu taller than the viewport.
 */
export function OrganizationSwitcher({
  organizations,
  currentId,
  onSelect,
  label = 'Switch organisation',
  footer,
  className,
}: OrganizationSwitcherProps) {
  const current = organizations.find((org) => org.id === currentId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={label} className={cn(triggerClass, 'h-9', className)}>
        <Avatar size="xs">
          {current?.logoUrl ? <AvatarImage src={current.logoUrl} /> : null}
          <AvatarFallback>{(current?.name ?? '?').charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[160px] truncate text-xs font-medium sm:block">
          {current?.name ?? '—'}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-72">
          {organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              role="menuitemradio"
              aria-checked={org.id === currentId}
              onSelect={() => onSelect(org.id)}
              className="gap-2"
            >
              <Avatar size="xs">
                {org.logoUrl ? <AvatarImage src={org.logoUrl} /> : null}
                <AvatarFallback>{org.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{org.name}</span>
                {org.description ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {org.description}
                  </span>
                ) : null}
              </span>
              {org.id === currentId ? (
                <Check className="size-4 shrink-0" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </ScrollArea>
        {footer ? (
          <>
            <DropdownMenuSeparator />
            {footer}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface NotificationEntry {
  id: string;
  title: string;
  description?: string;
  /** Pre-formatted by the application — relative time is a locale decision. */
  timestamp?: string;
  unread?: boolean;
  onSelect?: () => void;
}

export interface NotificationMenuProps {
  notifications: NotificationEntry[];
  /** Unread count. Omit to derive it from the entries. */
  unreadCount?: number;
  label?: string;
  emptyLabel?: string;
  /** Rendered under the list — "Mark all as read", "See all". */
  footer?: ReactNode;
  className?: string;
}

/**
 * The notifications menu.
 *
 * The trigger's accessible name carries the unread count, so it announces as "Notifications, 3
 * unread" rather than leaving the number to a badge a screen reader reads separately — or not at
 * all, since the badge is `aria-hidden` precisely because the count is already in the name.
 */
export function NotificationMenu({
  notifications,
  unreadCount,
  label = 'Notifications',
  emptyLabel = 'No notifications',
  footer,
  className,
}: NotificationMenuProps) {
  const unread = unreadCount ?? notifications.filter((entry) => entry.unread).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={unread > 0 ? `${label}, ${unread} unread` : label}
        className={cn(triggerClass, 'relative size-9 justify-center px-0', className)}
      >
        <NotificationGlyph />
        {unread > 0 ? (
          <Badge
            tone="danger"
            aria-hidden="true"
            className="absolute -end-1 -top-1 min-w-4 justify-center px-1 py-0 text-[10px] leading-4"
          >
            {unread > 9 ? '9+' : unread}
          </Badge>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ScrollArea className="max-h-80">
            {notifications.map((entry) => (
              <DropdownMenuItem
                key={entry.id}
                {...(entry.onSelect ? { onSelect: entry.onSelect } : {})}
                className="flex-col items-start gap-0.5 py-2"
              >
                <span className="flex w-full items-center gap-2">
                  {entry.unread ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
                  {entry.timestamp ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {entry.timestamp}
                    </span>
                  ) : null}
                </span>
                {entry.description ? (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {entry.description}
                  </span>
                ) : null}
                {/* The dot is decorative; the state has to reach assistive technology as text. */}
                {entry.unread ? <span className="sr-only">Unread</span> : null}
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
        {footer ? (
          <>
            <DropdownMenuSeparator />
            {footer}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9a6 6 0 0 1 12 0c0 5 1.5 6 1.5 6h-15S6 14 6 9M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}
