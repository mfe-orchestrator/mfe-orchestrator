import { cva } from "class-variance-authority"

const baseStyle = `
	p-0.5
	inline-flex
	items-center
	justify-center
	gap-0.5
	bg-background
	text-foreground
	border-2
	border-border
	h-max
`

export const tabsListVariants = cva(baseStyle, {
    variants: {
        layoutSize: {
            default: "rounded-md",
            sm: "rounded-sm",
            lg: "rounded-lg"
        },
        fullWidth: {
            true: "w-full grow",
            false: null
        }
    },
    defaultVariants: {
        layoutSize: "default"
    }
})
