import { cn } from "@/utils/styleUtils"
import { cva } from "class-variance-authority"

const baseStyle = `
	inline-flex
	items-center
	justify-center
	whitespace-nowrap
	font-medium 
	ring-offset-background
	tracking-normal
	border-2
	border-transparent
`

const hoverFocusState = `
	focus-visible:outline-none
	focus-visible:data-[state=active]:bg-accent/85
	hover:bg-accent/25
	hover:data-[state=active]:bg-accent/85
`

const activeState = `
	data-[state=active]:bg-accent
	data-[state=active]:text-accent-foreground
	data-[state=active]:border-border
	data-[state=active]:shadow-button
`

const disabledState = `
	disabled:pointer-events-none 
	disabled:opacity-75
	disabled:bg-foreground/75
`

export const tabsTriggerVariants = cva(cn(baseStyle, hoverFocusState, activeState, disabledState), {
    variants: {
        layoutSize: {
            default: "rounded-sm text-sm px-3 py-1.5 gap-1.5 [&_svg]:size-5",
            sm: "rounded-xs text-xs px-2 py-1 gap-1 [&_svg]:size-4",
            lg: "rounded-md text-base px-4 py-2 gap-2 [&_svg]:size-6"
        },
        fullWidth: {
            true: "w-full grow",
            false: null
        },
        iconButtons: {
            true: null,
            false: null
        }
    },
    compoundVariants: [
        {
            layoutSize: "default",
            iconButtons: true,
            class: "p-2"
        },
        {
            layoutSize: "sm",
            iconButtons: true,
            class: "p-1.5"
        },
        {
            layoutSize: "lg",
            iconButtons: true,
            class: "p-2"
        }
    ],
    defaultVariants: {
        layoutSize: "default",
        fullWidth: false,
        iconButtons: false
    }
})
