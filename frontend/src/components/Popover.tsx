import { type ReactNode, useEffect, useRef } from "react";

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** Names the popover for assistive technology and heads it visually. */
  title: string;
  children: ReactNode;
}

/**
 * A small anchored panel that closes on Escape or on a click outside.
 *
 * Both are listened for in the capture phase: a click on another header control should
 * close this and do its own job in the same gesture, which a bubbling listener would
 * sequence the other way round.
 */
export function Popover({ open, onClose, title, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="popover" ref={ref} role="dialog" aria-label={title}>
      <h3 className="popover-title">{title}</h3>
      {children}
    </div>
  );
}
