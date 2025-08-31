import { cn } from "@/utils/styleUtils"
import { cva } from "class-variance-authority"

const baseStyle = `
	text-sm
	font-medium
	tracking-normal
	flex
	items-center
	gap-2
	rounded-md
	border-2
	border-input
	bg-background
	ring-offset-background
	shadow-input
	placeholder:text-foreground/50
	invalid:border-destructive
`

const focusStyle = `
	focus-visible:outline-none
	focus-visible:ring-2
	focus-visible:ring-ring
	focus-visible:ring-offset-2
	focus-visible:border-primary
`

const fileInputStyle = `
	file:border-0
	file:bg-transparent
	file:text-sm
	file:font-medium
	file:text-foreground
`

const disabledStyle = `
	disabled:cursor-not-allowed
	disabled:opacity-75
	disabled:bg-foreground/25
`

export const inputVariants = cva(cn(baseStyle, fileInputStyle, focusStyle, disabledStyle), {
    variants: {
        layoutSize: {
            default: "px-3 py-2",
            sm: "gap-[0.375rem] text-xs rounded-sm px-2 py-[0.375rem]",
            lg: "gap-[0.75rem] text-base rounded-lg px-4 py-3 shadow-input-lg"
        },
        fullWidth: {
            true: "w-full",
            false: null
        }
    },
    defaultVariants: {
        layoutSize: "default"
    }
})
