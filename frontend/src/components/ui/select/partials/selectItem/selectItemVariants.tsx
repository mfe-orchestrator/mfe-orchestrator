import { cn } from "@/utils/styleUtils"
import { cva } from "class-variance-authority"

const baseStyle = `
	relative
	flex
	cursor-default 
	select-none
	items-center 
	outline-none
	w-full
`

const focusStyle = `
	focus:bg-accent 
	focus:text-accent-foreground 
`

const disabledStyle = `
	data-[disabled]:pointer-events-none 
	data-[disabled]:opacity-50
`

const activeIconStyle = `
	[&_.icon-container]:absolute
	[&_.icon-container]:top-[50%]
	[&_.icon-container]:translate-y-[-50%]
`

export const selectItemVariants = cva(cn(baseStyle, focusStyle, disabledStyle, activeIconStyle), {
    variants: {
        layoutSize: {
            default: "gap-1 text-sm rounded-sm py-2 ps-8 pe-2 [&_.icon-container]:left-2 [&_svg]:size-4",
            sm: "gap-[0.375rem] text-xs rounded-xs ps-6 pe-[0.375rem] py-[0.375rem] [&_.icon-container]:left-[0.375rem] [&_svg]:size-3.5",
            lg: "gap-[0.75rem] text-base rounded-md ps-10 pe-3 py-3 [&_.icon-container]:left-3 [&_svg]:size-5"
        }
    },
    defaultVariants: {
        layoutSize: "default"
    }
})
