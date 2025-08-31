import * as SelectPrimitive from "@radix-ui/react-select"
import * as React from "react"
import { cn } from "@/utils/styleUtils"
import { SelectContext } from "../select"

const SelectSeparator = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>>(({ className, ...props }, ref) => {
    const { layoutSize } = React.useContext(SelectContext)
    const marginX = layoutSize === "lg" ? "mx-2" : layoutSize === "sm" ? "mx-1" : "mx-1.5"

    return <SelectPrimitive.Separator ref={ref} className={cn("my-2 h-px bg-border/25", marginX, className)} {...props} />
})
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export { SelectSeparator }
