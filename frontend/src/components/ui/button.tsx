import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/styleUtils"

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 tracking-normal border-2 shadow-button whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:shadow-button-active",
    {
        variants: {
            variant: {
                primary: "bg-primary text-primary-foreground hover:bg-primary/85",
                destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/85",
                secondary: "bg-background hover:bg-primary/10",
                accent: "bg-accent text-accent-foreground hover:bg-accent/85",
                ghost: "border-0 shadow-none hover:bg-accent hover:text-accent-foreground",
                link: "border-0 shadow-none text-primary underline-offset-4 hover:underline"
            },
            size: {
                default: "px-4 py-2",
                sm: "gap-[0.375rem] text-xs rounded-md px-3 py-2",
                lg: "gap-[0.75rem] text-base rounded-xl px-6 py-4 shadow-button-lg active:shadow-button-lg-active",
                icon: "p-3"
            }
        },
        defaultVariants: {
            variant: "primary",
            size: "default"
        }
    }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
