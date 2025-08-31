import { cn } from "@/utils/styleUtils"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check } from "lucide-react"
import * as React from "react"
import { SelectContext } from "../../select"
import { selectItemVariants } from "./selectItemVariants"

const SelectItem = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(({ className, children, ...props }, ref) => {
    const { layoutSize } = React.useContext(SelectContext)

    return (
        <SelectPrimitive.Item ref={ref} className={cn(selectItemVariants({ layoutSize }), className)} {...props}>
            <SelectPrimitive.ItemIndicator className="icon-container">
                <Check />
            </SelectPrimitive.ItemIndicator>

            <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        </SelectPrimitive.Item>
    )
})

SelectItem.displayName = SelectPrimitive.Item.displayName

export { SelectItem }
