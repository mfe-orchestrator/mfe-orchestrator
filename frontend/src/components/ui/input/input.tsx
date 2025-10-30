import { VariantProps } from "class-variance-authority"
import * as React from "react"
import { cn } from "@/utils/styleUtils"
import { inputVariants } from "./inputVariants"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, VariantProps<typeof inputVariants> {
    fullWidth?: boolean
    onDebounce?: (value: string | number | readonly string[]) => void | Promise<void>
    debounceTime?: number
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, layoutSize, fullWidth, onDebounce, debounceTime = 500, ...props }, ref) => {
    React.useEffect(() => {
        if (!onDebounce) return
        //console.log("Checking repository name availability for:", repositoryName)
        const timeoutId = setTimeout(async () => {
            //console.log("Set timeout started", repositoryName)
            onDebounce?.(props.value)
        }, debounceTime)

        return () => clearTimeout(timeoutId)
    }, [props.value, debounceTime, onDebounce])

    return <input type={type} className={cn(inputVariants({ layoutSize, fullWidth }), className)} ref={ref} {...props} />
})
Input.displayName = "Input"

export { Input }
