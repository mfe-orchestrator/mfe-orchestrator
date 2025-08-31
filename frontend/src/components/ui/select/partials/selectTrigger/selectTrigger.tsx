import { cn } from "@/utils/styleUtils"
import * as SelectPrimitive from "@radix-ui/react-select"
import { ChevronDown } from "lucide-react"
import * as React from "react"
import { SelectContext } from "../../select"
import { selectTriggerVariants } from "./selecTriggerVariants"

const SelectTrigger = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(({ className, children, ...props }, ref) => {
    const { layoutSize, fullWidth } = React.useContext(SelectContext)
    return (
        <SelectPrimitive.Trigger ref={ref} className={cn(selectTriggerVariants({ layoutSize, fullWidth, className }), className)} {...props}>
            {children}
            <SelectPrimitive.Icon asChild>
                <ChevronDown />
            </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
    )
})
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

export { SelectTrigger }
