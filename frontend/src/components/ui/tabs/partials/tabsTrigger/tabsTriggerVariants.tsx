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
	data-[state=active]:border-2
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
            default: "rounded-sm text-sm px-3 py-1.5",
            sm: "rounded-xs text-xs px-2 py-1",
            lg: "rounded-md text-base px-4 py-2"
        },
        fullWidth: {
            true: "w-full grow",
            false: ""
        }
    },
    defaultVariants: {
        layoutSize: "default"
    }
})
