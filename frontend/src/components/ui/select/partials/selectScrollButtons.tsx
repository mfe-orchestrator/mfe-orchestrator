import { cn } from "@/utils/styleUtils"
import * as SelectPrimitive from "@radix-ui/react-select"
import { ChevronDown, ChevronUp } from "lucide-react"
import * as React from "react"

const baseStyle = `
	flex
	cursor-default 
	items-center 
	justify-center 
	py-2 px-1
`

const SelectScrollUpButton = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.ScrollUpButton>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>>(
    ({ className, ...props }, ref) => (
        <SelectPrimitive.ScrollUpButton ref={ref} className={cn(baseStyle, "shadow-[0_2px_4px_rgba(13,0,72,0.125)]", className)} {...props}>
            <ChevronUp size="1rem" />
        </SelectPrimitive.ScrollUpButton>
    )
)
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.ScrollDownButton>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>>(
    ({ className, ...props }, ref) => (
        <SelectPrimitive.ScrollDownButton ref={ref} className={cn(baseStyle, "shadow-[0_-2px_4px_rgba(13,0,72,0.125)]", className)} {...props}>
            <ChevronDown size="1rem" />
        </SelectPrimitive.ScrollDownButton>
    )
)
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

export { SelectScrollDownButton, SelectScrollUpButton }
