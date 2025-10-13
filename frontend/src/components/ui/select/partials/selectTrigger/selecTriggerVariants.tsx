import { cn } from "@/utils/styleUtils"
import { cva } from "class-variance-authority"

const baseStyle = `
	text-sm
	font-medium
	tracking-normal
	flex
	items-center
	justify-between
	gap-2
	rounded-md
	border-2
	border-input
	bg-background
	ring-offset-background
	shadow-input
	placeholder:text-foreground/50
	invalid:border-destructive
	[&>span]:line-clamp-1
	[&_svg]:size-4
`

const focusStyle = `
	focus-visible:outline-none
	focus-visible:ring-2
	focus-visible:ring-ring
	focus-visible:ring-offset-2
	focus-visible:border-primary
`

const disabledStyle = `
	disabled:cursor-not-allowed
	disabled:opacity-75
	disabled:bg-foreground/25
`

export const selectTriggerVariants = cva(cn(baseStyle, focusStyle, disabledStyle), {
    variants: {
        layoutSize: {
            default: "ps-3 pe-2 py-2 min-h-[2.5rem]",
            sm: "gap-[0.375rem] text-xs rounded-sm ps-2 pe-[0.375rem] py-[0.375rem]",
            lg: "gap-[0.75rem] text-base rounded-lg ps-4 pe-3 py-3 shadow-input-lg [&_svg]:size-5"
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
