import { cn } from "@/utils/styleUtils";
import { type VariantProps } from "class-variance-authority";
import * as React from "react";
import { BadgeVariants } from "./BadgeVariants";

export interface IBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof BadgeVariants> {}

export const Badge: React.FC<IBadgeProps> = ({ className, variant, size, ...props }) => {
  return (
    <div
      className={cn("badge", BadgeVariants({ variant, size }), className)}
      {...props}
    />
  );
};

Badge.displayName = "Badge";

export default Badge;
