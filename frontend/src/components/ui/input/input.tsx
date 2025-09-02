import { cn } from "@/utils/styleUtils"
import { VariantProps } from "class-variance-authority"
import * as React from "react"
import { inputVariants } from "./inputVariants"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, VariantProps<typeof inputVariants> {
    fullWidth?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, layoutSize, fullWidth, ...props }, ref) => {
    return <input type={type} className={cn(inputVariants({ layoutSize, fullWidth }), className)} ref={ref} {...props} />
})
Input.displayName = "Input"

export { Input }
