import * as TabsPrimitive from "@radix-ui/react-tabs"
import * as React from "react"

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
    layoutSize?: "default" | "sm" | "lg"
    tabsListPosition?: "start" | "end" | "center" | "fullWidth"
    iconButtons?: boolean
}

const TabsContext = React.createContext<TabsProps>({})

const Tabs = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.Root>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & TabsProps>(
    ({ children, layoutSize = "default", tabsListPosition = "start", iconButtons = false, ...props }, ref) => {
        const tabsProps = React.useMemo(() => ({ layoutSize, tabsListPosition, iconButtons }), [layoutSize, tabsListPosition, iconButtons])

        return (
            <TabsContext.Provider value={tabsProps}>
                <TabsPrimitive.Root {...props}>{children}</TabsPrimitive.Root>
            </TabsContext.Provider>
        )
    }
)

Tabs.displayName = TabsPrimitive.Root.displayName

export { Tabs, TabsContext }
