import * as SelectPrimitive from "@radix-ui/react-select"
import * as React from "react"
import { cn } from "@/utils/styleUtils"
import { SelectContext } from "../../select"
import { selectLabelVariants } from "./selectLabelVariants"

const SelectLabel = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.Label>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>>(({ className, ...props }, ref) => {
    const { layoutSize } = React.useContext(SelectContext)

    return <SelectPrimitive.Label ref={ref} className={cn(selectLabelVariants({ layoutSize }), className)} {...props} />
})
SelectLabel.displayName = SelectPrimitive.Label.displayName

export { SelectLabel }
