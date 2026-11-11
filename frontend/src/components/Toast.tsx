import { Icon } from "./Icon";

export interface ToastProps {
  message: string | null;
}

/**
 * Command feedback.
 *
 * `role="status"` so it is announced without stealing focus, and the wording is always
 * "sent", never "done" — the unit's next telemetry frame is what confirms a command.
 */
export function Toast({ message }: ToastProps) {
  if (!message) return null;
  return (
    <output className="toast">
      <Icon name="check" size={15} />
      <span>{message}</span>
    </output>
  );
}
