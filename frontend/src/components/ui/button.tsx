import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/styleUtils"

const baseStyle = `
    inline-flex
	items-center
	justify-center
	gap-2
	tracking-normal
	border-2 
	shadow-button 
	whitespace-nowrap 
	rounded-md 
	text-sm 
	font-medium 
	transition-colors 
`

const focusStyle = `
	focus-visible:outline-none 
	focus-visible:ring-4 
	focus-visible:ring-ring 
	focus-visible:ring-offset-2
`

const disabledStyle = `
	disabled:pointer-events-none 
	disabled:opacity-75
	disabled:bg-foreground/75
`

const iconStyle = `
	[&_svg]:pointer-events-none 
	[&_svg]:size-4
	[&_svg]:shrink-0
`

const activeStyle = `
	active:shadow-button-active
`

const buttonVariants = cva(cn(baseStyle, focusStyle, disabledStyle, iconStyle, activeStyle), {
    variants: {
        variant: {
            primary: `
				bg-primary text-primary-foreground
				hover:bg-primary/85
				focus-visible:bg-primary/85
				active:bg-primary-active
				`,
            destructive: `
				bg-destructive text-destructive-foreground
				hover:bg-destructive/85
				focus-visible:bg-destructive/85
				active:bg-destructive-active
				`,
            secondary: `
				bg-background
				hover:bg-primary/15
				focus-visible:bg-primary/15
				active:bg-primary/30
				disabled:bg-foreground/25
				`,
            accent: `
				bg-accent text-accent-foreground
				hover:bg-accent/85
				active:bg-accent-active
				`,
            ghost: `
				border-0 shadow-none text-primary
				hover:bg-primary/15
				focus-visible:bg-primary/15
				active:bg-primary/30 active:shadow-none active:text-primary-active
				`,
            link: `
				border-0 shadow-none text-primary underline underline-offset-4 decoration-[.125rem]
				hover:text-primary/75
				focus-visible:text-primary/75
				active:ring-4 active:ring-ring active:ring-offset-2 active:shadow-none
				`
        },
        size: {
            default: "px-4 py-2",
            sm: "gap-[0.375rem] text-xs rounded-md px-3 py-2",
            lg: "gap-[0.75rem] text-base rounded-xl px-6 py-4 shadow-button-lg active:shadow-button-lg-active",
            icon: "p-3",
            "icon-sm": "p-2"
        }
    },
    defaultVariants: {
        variant: "primary",
        size: "default"
    }
})

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
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
