import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * `primary` inverts ink rather than borrowing a status hue.
 * `danger` is reserved for stops — the one place red means an action, per IEC 60073.
 */
export type ButtonVariant = "default" | "primary" | "danger" | "ghost" | "outline-stop";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  block?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "default",
  size = "md",
  icon,
  block,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = ["btn", `btn-${variant}`, `btn-${size}`];
  if (block) classes.push("btn-block");
  if (className) classes.push(className);

  return (
    <button className={classes.join(" ")} type={type} {...rest}>
      {icon ? <Icon name={icon} size={size === "sm" ? 13 : 15} /> : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "children" | "icon" | "block"> {
  icon: IconName;
  /** Required: an icon-only control has no visible text to name it. */
  label: string;
}

/**
 * The label is given twice on purpose: `aria-label` for assistive technology, `title` for
 * someone with a mouse and only a glyph to go on. Neither carries more than the name.
 */
export function IconButton({ icon, label, size = "md", ...rest }: IconButtonProps) {
  return (
    <Button {...rest} size={size} aria-label={label} title={label} className="btn-icon">
      <Icon name={icon} size={16} />
    </Button>
  );
}
