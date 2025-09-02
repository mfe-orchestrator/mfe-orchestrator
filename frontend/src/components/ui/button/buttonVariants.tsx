import { cn } from "@/utils/styleUtils"
import { cva } from "class-variance-authority"

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

// TODO: remove size
const iconStyle = `
	[&_svg]:pointer-events-none
	[&_svg]:size-5
	[&_svg]:shrink-0
`

const activeStyle = `
	active:shadow-button-active
`

export const buttonVariants = cva(cn(baseStyle, focusStyle, disabledStyle, iconStyle, activeStyle), {
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
            sm: "gap-[0.375rem] text-xs rounded-sm px-3 py-[0.375rem]",
            lg: "gap-[0.75rem] text-base rounded-lg px-5 py-3 shadow-button-lg active:shadow-button-lg-active",
            icon: "p-2 aspect-square",
            "icon-sm": "p-[0.375rem] aspect-square"
        }
    },
    defaultVariants: {
        variant: "primary",
        size: "default"
    }
})
