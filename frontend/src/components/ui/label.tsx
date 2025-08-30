import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils/styleUtils"

const labelVariants = cva("font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", {
    variants: {
        textSize: {
            default: "text-sm",
            sm: "text-xs",
            lg: "text-md"
        }
    },
    defaultVariants: {
        textSize: "default"
    }
})

const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>>(
    ({ className, textSize, ...props }, ref) => <LabelPrimitive.Root ref={ref} className={cn(labelVariants({ textSize }), className)} {...props} />
)
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
