import * as TabsPrimitive from "@radix-ui/react-tabs"
import { VariantProps } from "class-variance-authority"
import * as React from "react"
import { TabsContext } from "@/components/ui/tabs/tabs"
import { cn } from "@/utils/styleUtils"
import { tabsTriggerVariants } from "./tabsTriggerVariants"

const TabsTrigger = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & VariantProps<typeof tabsTriggerVariants>>(
    ({ className, ...props }, ref) => {
        const { layoutSize, tabsListPosition, iconButtons } = React.useContext(TabsContext)
        const fullWidth = tabsListPosition === "fullWidth"

        return <TabsPrimitive.Trigger ref={ref} className={cn(tabsTriggerVariants({ layoutSize, fullWidth, iconButtons }), className)} {...props} />
    }
)
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export { TabsTrigger }
