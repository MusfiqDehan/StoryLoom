"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/primitives";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZE_CLASSES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

/**
 * Accessible Radix-backed modal wrapper preserving the public `Modal` API
 * (focus trap, portal, ESC handling, and responsive viewport sizing).
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`${SIZE_CLASSES[size]} overflow-hidden p-0`}>
        <DialogHeader className={title ? undefined : "sr-only"}>
          <DialogTitle>{title || "Dialog"}</DialogTitle>
          <DialogDescription className="sr-only">
            {title || "Interactive dialog"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
