import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/utils/styleUtils"
import { tabsListVariants } from "./tabsListVariants"
import { VariantProps } from "class-variance-authority"
import { TabsContext } from "@/components/ui/tabs/tabs"

const TabsList = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>>(
    ({ className, ...props }, ref) => {
        const { layoutSize, tabsListPosition } = React.useContext(TabsContext)
        const fullWidth = tabsListPosition === "fullWidth"

        const getContainerClasses = () => {
            switch (tabsListPosition) {
                case "fullWidth":
                    return "w-full"
                case "start":
                    return "flex align-center justify-start"
                case "end":
                    return "flex align-center justify-end"
                case "center":
                    return "flex align-center justify-center"
            }
        }

        return (
            <div className={getContainerClasses()}>
                <TabsPrimitive.List ref={ref} className={cn(tabsListVariants({ layoutSize, fullWidth }), className)} {...props} />
            </div>
        )
    }
)
TabsList.displayName = TabsPrimitive.List.displayName

export { TabsList }
