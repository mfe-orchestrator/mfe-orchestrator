import { cn } from "@/utils/styleUtils"
import { type VariantProps } from "class-variance-authority"
import * as React from "react"
import { badgeVariants } from "./badgeVariants"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
    return <div className={cn("badge", badgeVariants({ variant, size }), className)} {...props} />
}

export { Badge }
