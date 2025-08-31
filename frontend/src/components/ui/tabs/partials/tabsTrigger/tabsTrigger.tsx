import * as TabsPrimitive from "@radix-ui/react-tabs"
import * as React from "react"

import { cn } from "@/utils/styleUtils"
import { TabsContext } from "@/components/ui/tabs/tabs"
import { tabsTriggerVariants } from "./tabsTriggerVariants"
import { VariantProps } from "class-variance-authority"

const TabsTrigger = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & VariantProps<typeof tabsTriggerVariants>>(
    ({ className, ...props }, ref) => {
        const { layoutSize, tabsListPosition } = React.useContext(TabsContext)
        const fullWidth = tabsListPosition === "fullWidth"

        return <TabsPrimitive.Trigger ref={ref} className={cn(tabsTriggerVariants({ layoutSize, fullWidth }), className)} {...props} />
    }
)
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export { TabsTrigger }
