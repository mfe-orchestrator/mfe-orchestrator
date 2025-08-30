import { cn } from "@/utils/styleUtils"
import { cva, VariantProps } from "class-variance-authority"
import * as React from "react"

const baseStyle = `
	text-sm
	font-medium
	tracking-normal
	flex
	gap-2
	rounded-md
	border-2
	border-input
	bg-background
	ring-offset-background
	placeholder:text-foreground/50
`

const focusStyle = `
	focus-visible:outline-none
	focus-visible:ring-2
	focus-visible:ring-ring
	focus-visible:ring-offset-2
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

const iconStyle = `
	
`

const activeStyle = `
	
`

const inputVariants = cva(cn(baseStyle, fileInputStyle, focusStyle, disabledStyle, iconStyle, activeStyle), {
    variants: {
        layoutSize: {
            default: "px-3 py-2",
            sm: "gap-[0.375rem] text-xs rounded-sm px-2 py-[0.375rem]",
            lg: "gap-[0.75rem] text-base rounded-lg px-4 py-3"
        },
        fullWidth: {
            true: "w-full",
            false: ""
        }
    },
    defaultVariants: {
        layoutSize: "default"
    }
})

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, VariantProps<typeof inputVariants> {
    fullWidth?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, layoutSize, fullWidth, ...props }, ref) => {
    return <input type={type} className={cn(inputVariants({ layoutSize, fullWidth, className }))} ref={ref} {...props} />
})
Input.displayName = "Input"

export { Input }
