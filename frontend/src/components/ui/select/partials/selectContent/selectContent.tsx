import { cn } from "@/utils/styleUtils"
import * as SelectPrimitive from "@radix-ui/react-select"
import { VariantProps } from "class-variance-authority"
import * as React from "react"
import { SelectContext } from "../../select"
import { SelectScrollDownButton, SelectScrollUpButton } from "../selectScrollButtons"
import { selectContentVariants } from "./selectContentVariants"

const SelectContent = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.Content>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & VariantProps<typeof selectContentVariants>>(
    ({ className, children, position = "popper", ...props }, ref) => {
        const { layoutSize, fullWidth } = React.useContext(SelectContext)

        return (
            <SelectPrimitive.Portal>
                <SelectPrimitive.Content ref={ref} className={cn(selectContentVariants({ layoutSize, fullWidth, position }), className)} position={position} {...props}>
                    <SelectScrollUpButton />
                    <SelectPrimitive.Viewport className="viewport">{children}</SelectPrimitive.Viewport>
                    <SelectScrollDownButton />
                </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
        )
    }
)
SelectContent.displayName = SelectPrimitive.Content.displayName

export { SelectContent }
