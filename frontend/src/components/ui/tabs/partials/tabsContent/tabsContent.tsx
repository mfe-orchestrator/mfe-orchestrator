import * as TabsPrimitive from "@radix-ui/react-tabs"
import * as React from "react"

import { cn } from "@/utils/styleUtils"

const baseStyle = `
	mt-4
	w-full
	rounded-md
	ring-offset-background
	focus-visible:outline-none
	focus-visible:ring-2
	focus-visible:ring-ring
	focus-visible:ring-offset-2
`

const TabsContent = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(({ className, ...props }, ref) => (
    <TabsPrimitive.Content ref={ref} className={cn(baseStyle, className)} {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { TabsContent }
