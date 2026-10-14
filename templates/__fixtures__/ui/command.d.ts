/**
 * Type-only stand-in for the shadcn/ui `command` component the template
 * imports from the user's project. Not shipped — it exists so `npm run
 * typecheck` compiles the template against the real signatures.
 *
 * Mirrors ui.shadcn.com/r/styles/new-york-v4/command.json: every element takes
 * the props of the cmdk primitive it wraps, which is what makes the controlled
 * `value`, `onValueChange` and `filter` on the root legal.
 */
import type * as React from "react";
import type { Command as CommandPrimitive } from "cmdk";

export declare function Command(props: React.ComponentProps<typeof CommandPrimitive>): React.JSX.Element;
export declare function CommandInput(props: React.ComponentProps<typeof CommandPrimitive.Input>): React.JSX.Element;
export declare function CommandList(props: React.ComponentProps<typeof CommandPrimitive.List>): React.JSX.Element;
export declare function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>): React.JSX.Element;
export declare function CommandGroup(props: React.ComponentProps<typeof CommandPrimitive.Group>): React.JSX.Element;
export declare function CommandItem(props: React.ComponentProps<typeof CommandPrimitive.Item>): React.JSX.Element;
export declare function CommandSeparator(
  props: React.ComponentProps<typeof CommandPrimitive.Separator>,
): React.JSX.Element;
export declare function CommandShortcut(props: React.ComponentProps<"span">): React.JSX.Element;
