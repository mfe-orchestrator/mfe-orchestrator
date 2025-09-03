import { cn } from "@/utils/styleUtils"
import { cva } from "class-variance-authority"

const baseStyle = `
	w-full
	font-medium
	flex
	items-center
	gap-2
	py-2.5
	rounded-sm
	transition-colors
	border-2
	hover:border-accent/25
`

const labelStyle = `
	[&_span]:w-full
	[&_span]:text-start
	[&_span]:overflow-hidden
	[&_span]:text-ellipsis
`

export const navItemVariants = cva(cn(baseStyle, labelStyle), {
    variants: {
        type: {
            main: "text-base text-foreground px-4 [&_svg]:size-5",
            secondary: "text-sm text-foreground-secondary px-3 [&_svg]:size-4"
        },
        active: {
            true: "border-accent hover:border-accent",
            false: "border-transparent"
        },
        isSidebarCollapsed: {
            true: "justify-center",
            false: "justify-start"
        }
    }
})
