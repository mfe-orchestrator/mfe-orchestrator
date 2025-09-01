import { cva } from "class-variance-authority"

const baseStyle = `
	inline-flex
	items-center
	rounded-sm
	border-2
	py-1
	font-medium
	tracking-normal
	focus:outline-none
	focus:ring-2 
	focus:ring-ring 
	focus:ring-offset-2
`

export const badgeVariants = cva(baseStyle, {
    variants: {
        variant: {
            default: "border-border bg-primary/25 text-foreground",
            accent: "border-border bg-accent/25 text-foreground",
            destructive: "border-destructive bg-destructive/25 text-destructive-active",
            outline: "text-foreground"
        },
        size: {
            default: "text-xs/4 px-2.5 gap-2",
            lg: "text-base/5 px-3 gap-3"
        }
    },
    defaultVariants: {
        variant: "default",
        size: "default"
    }
})
