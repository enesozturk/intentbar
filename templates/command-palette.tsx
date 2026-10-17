"use client";

/**
 * Command palette with natural-language navigation.
 *
 * Copied into your project by the `intentbar-setup` skill — it is yours now, so
 * edit it freely. The package does the resolving; this file only renders.
 *
 * It is built on your own shadcn/ui `command` and `dialog` components, so it
 * inherits your theme. Note that it composes `Dialog` + `Command` directly
 * rather than using shadcn's `CommandDialog`: that wrapper spreads its props
 * onto `Dialog` and gives the cmdk root a fixed className, so there is no way
 * to pass the controlled `value` and custom `filter` this palette needs.
 */

import * as React from "react";

import { defaultFilter } from "cmdk";
import { CornerDownLeftIcon, SparklesIcon } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// Point this at wherever the resolver was copied, e.g. "@/lib/intentbar/react".
import { useIntentbar } from "intentbar/react";

/** A command your app already offers, shown below the resolved rows. */
export type PaletteCommand = {
  id: string;
  label: string;
  /** Optional group heading. Commands sharing a heading render together. */
  group?: string;
  /** Right-aligned hint, e.g. "⌘B". */
  shortcut?: string;
  icon?: React.ReactNode;
  perform: () => void;
};

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Navigate inside your app — `router.push` in Next, `navigate` in React Router. */
  onNavigate: (path: string) => void;
  commands?: PaletteCommand[];
  /** The tenant the user is currently in, when your app has tenants. */
  scopeId?: string;
  placeholder?: string;
  /** Where `createHandler` is mounted. Default `/api/intentbar`. */
  endpoint?: string;
  /** Extra headers for the lookup, for an auth token your endpoint expects. */
  headers?: Record<string, string>;
};

/**
 * cmdk values for the resolved rows.
 *
 * The prefix carries weight: these rows do not contain the typed text, so
 * cmdk's default scorer would hide them. `paletteFilter` keeps anything
 * prefixed and scores everything else normally.
 */
const RESULT_VALUE = "intentbar-result";
const FALLBACK_VALUE = "intentbar-fallback";
const STATUS_VALUE = "intentbar-status";

function paletteFilter(value: string, search: string, keywords?: string[]): number {
  return value.startsWith("intentbar-") ? 1 : defaultFilter(value, search, keywords);
}

/** A row's path without its prefilled query. */
function withoutQuery(path: string): string {
  return path.split("?")[0] ?? path;
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  commands = [],
  scopeId,
  placeholder = "Type a command, or where you want to go…",
  endpoint,
  headers,
}: CommandPaletteProps) {
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState("");

  // Typing a command this palette already lists must never cost a model call.
  const isExistingCommand = React.useMemo(() => {
    const typed = search.trim().toLowerCase();
    return commands.some((command) => command.label.toLowerCase() === typed);
  }, [commands, search]);

  const { resolution, isResolving, error } = useIntentbar(search, {
    endpoint,
    scopeId,
    headers,
    enabled: !isExistingCommand,
  });

  const match = resolution?.status === "matched" ? resolution : null;
  const fallback = resolution?.fallback ?? null;

  // With the query already prefilled, opening that same page empty is a worse
  // version of the fallback row, so it is not offered twice.
  const pageMatch = match && !(fallback && withoutQuery(fallback.path) === match.path) ? match : null;

  const hasResolvedSection = isResolving || !!resolution || !!error;

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // Reset on OPEN, not on close: clearing on close swaps the list back to the
  // default commands mid fade-out. Layout effect so the old query is never painted.
  React.useLayoutEffect(() => {
    if (open) setSearch("");
  }, [open]);

  // Focus the suggestion as soon as it arrives so Enter acts on it. A question
  // outranks a page: the user wrote a question, not a destination.
  React.useEffect(() => {
    if (fallback) setSelected(FALLBACK_VALUE);
    else if (pageMatch) setSelected(RESULT_VALUE);
  }, [fallback, pageMatch]);

  const go = React.useCallback(
    (path: string) => {
      onOpenChange(false);
      onNavigate(path);
    },
    [onNavigate, onOpenChange],
  );

  const groups = React.useMemo(() => {
    const byGroup = new Map<string, PaletteCommand[]>();
    for (const command of commands) {
      const heading = command.group ?? "Commands";
      byGroup.set(heading, [...(byGroup.get(heading) ?? []), command]);
    }
    return [...byGroup.entries()];
  }, [commands]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Command palette</DialogTitle>
        <DialogDescription>Search for a command, or describe where you want to go.</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <Command
          value={selected}
          onValueChange={setSelected}
          filter={paletteFilter}
          loop
          className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input]]:h-12"
        >
          <CommandInput value={search} onValueChange={setSearch} placeholder={placeholder} />

          <CommandList>
            {!hasResolvedSection && <CommandEmpty>No results found.</CommandEmpty>}

            {fallback && (
              <CommandGroup heading="Ask">
                <CommandItem value={FALLBACK_VALUE} onSelect={() => go(fallback.path)}>
                  <SparklesIcon className="text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="shrink-0">Ask</span>
                    <span className="truncate text-muted-foreground">&ldquo;{fallback.query}&rdquo;</span>
                    <ScopeHint scope={fallback.scope} />
                  </span>
                  <CommandShortcut>
                    <CornerDownLeftIcon className="size-3" />
                  </CommandShortcut>
                </CommandItem>
              </CommandGroup>
            )}

            {hasResolvedSection && (pageMatch || !fallback) && (
              <CommandGroup heading="Go to">
                {pageMatch ? (
                  <CommandItem value={RESULT_VALUE} onSelect={() => go(pageMatch.path)}>
                    <SparklesIcon className="text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      {pageMatch.breadcrumb.map((part, index) => (
                        <React.Fragment key={`${part}-${index}`}>
                          {index > 0 && <span className="shrink-0 text-muted-foreground">›</span>}
                          <span
                            className={
                              index === pageMatch.breadcrumb.length - 1 ? "truncate" : "shrink-0 text-muted-foreground"
                            }
                          >
                            {part}
                          </span>
                        </React.Fragment>
                      ))}
                      <ScopeHint scope={pageMatch.scope} />
                    </span>
                    <CommandShortcut>
                      <CornerDownLeftIcon className="size-3" />
                    </CommandShortcut>
                  </CommandItem>
                ) : (
                  // Never silent: "looking", "nothing found" and "the lookup
                  // broke" are three different things, and a blank list reads
                  // as a dead feature.
                  <CommandItem value={STATUS_VALUE} disabled>
                    <SparklesIcon className="text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {isResolving
                        ? "Finding the right page…"
                        : error
                          ? "Couldn't look that up. Try again."
                          : "No matching page found."}
                    </span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}

            {groups.map(([heading, items]) => (
              <CommandGroup key={heading} heading={heading}>
                {items.map((command) => (
                  <CommandItem
                    key={command.id}
                    value={command.label}
                    onSelect={() => {
                      onOpenChange(false);
                      command.perform();
                    }}
                  >
                    {command.icon}
                    <span className="flex-1 truncate">{command.label}</span>
                    {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Says the row moves the user to another tenant, which is worth announcing. */
function ScopeHint({ scope }: { scope: { name: string; isCurrent: boolean } | null | undefined }) {
  if (!scope || scope.isCurrent) return null;
  return <span className="ml-1 shrink-0 truncate text-muted-foreground">in {scope.name}</span>;
}
