import { cn } from "@/utils/styleUtils";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { Link } from "react-router-dom";
import { ButtonVariants } from "./ButtonVariants";
import { IButtonProps } from "./IButtonProps";

export const Button: React.FC<IButtonProps> = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  IButtonProps
>(({ className, variant, size, asChild = false, href, disabled, type, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  if (href) {
    return (
      <Link
        className={cn(ButtonVariants({ variant, size }), className)}
        to={href}
        ref={ref as React.Ref<HTMLAnchorElement>}
        {...props}
      />
    );
  }

  return (
    <Comp
      className={cn(ButtonVariants({ variant, size }), className)}
      ref={ref as React.Ref<HTMLButtonElement>}
      disabled={disabled}
      type={type}
      {...props}
    />
  );
});

Button.displayName = "Button";

export default Button;
