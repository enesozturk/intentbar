/**
 * Type-only stand-in for the shadcn/ui `dialog` component. See command.d.ts.
 *
 * `showCloseButton` on DialogContent is shadcn's own addition, not Radix's;
 * the template relies on it to hide the corner X on a palette.
 */
import type * as React from "react";

export declare function Dialog(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}): React.JSX.Element;
export declare function DialogContent(
  props: React.ComponentProps<"div"> & { showCloseButton?: boolean },
): React.JSX.Element;
export declare function DialogHeader(props: React.ComponentProps<"div">): React.JSX.Element;
export declare function DialogTitle(props: React.ComponentProps<"h2">): React.JSX.Element;
export declare function DialogDescription(props: React.ComponentProps<"p">): React.JSX.Element;
