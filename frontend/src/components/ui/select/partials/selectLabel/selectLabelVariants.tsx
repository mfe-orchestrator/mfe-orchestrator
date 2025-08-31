import { cn } from "@/utils/styleUtils"
import { cva } from "class-variance-authority"

const baseStyle = `
	text-primary/75
	font-semibold
`

export const selectLabelVariants = cva(cn(baseStyle), {
    variants: {
        layoutSize: {
            default: "text-sm py-2 px-2",
            sm: "text-xs px-[0.375rem] py-[0.375rem]",
            lg: "text-base px-3 py-3"
        }
    },
    defaultVariants: {
        layoutSize: "default"
    }
})
