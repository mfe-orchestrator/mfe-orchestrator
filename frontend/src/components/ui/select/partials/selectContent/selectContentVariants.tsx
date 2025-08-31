import { cn } from "@/utils/styleUtils"
import { cva } from "class-variance-authority"

const baseStyle = `
	relative
	z-50
	max-h-96
	overflow-hidden
	bg-popover
	text-popover-foreground
	border-2
	border-input
	[&_.viewport]:p-1

	data-[state=open]:animate-in
	data-[state=closed]:animate-out
	data-[state=closed]:fade-out-0
	data-[state=open]:fade-in-0
	data-[state=closed]:zoom-out-95
	data-[state=open]:zoom-in-95
	data-[side=bottom]:slide-in-from-top-2
	data-[side=left]:slide-in-from-right-2
	data-[side=right]:slide-in-from-left-2
	data-[side=top]:slide-in-from-bottom-2
`

const popperStyle = `
	data-[side=bottom]:translate-y-1
	data-[side=left]:-translate-x-1
	data-[side=right]:translate-x-1
	data-[side=top]:-translate-y-1
	
	[&_.viewport]:h-[var(--radix-select-trigger-height)]
	[&_.viewport]:w-full
	[&_.viewport]:min-w-[calc(var(--radix-select-trigger-width)-4px)]
`

export const selectContentVariants = cva(cn(baseStyle), {
    variants: {
        layoutSize: {
            default: "rounded-md",
            sm: "rounded-sm",
            lg: "rounded-lg"
        },
        fullWidth: {
            true: "w-full",
            false: null
        },
        position: {
            popper: popperStyle,
            "item-aligned": null
        }
    },
    defaultVariants: {
        layoutSize: "default"
    }
})
