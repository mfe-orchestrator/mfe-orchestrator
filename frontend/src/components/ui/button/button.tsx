import { cn } from "@/utils/styleUtils"
import { Slot } from "@radix-ui/react-slot"
import { type VariantProps } from "class-variance-authority"
import * as React from "react"
import { buttonVariants } from "./buttonVariants"
import { Link } from "react-router-dom"

export interface ButtonProps extends React.HTMLAttributes<HTMLButtonElement | HTMLAnchorElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean
    href?: string
    disabled?: boolean
}

const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(({ className, variant, size, asChild = false, href, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    if (href) {
        return <Link className={cn(buttonVariants({ variant, size }), className)} to={href} ref={ref as React.Ref<HTMLAnchorElement>} {...props} />
    }
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref as React.Ref<HTMLButtonElement>} disabled={disabled} {...props} />
})
Button.displayName = "Button"

export { Button }
