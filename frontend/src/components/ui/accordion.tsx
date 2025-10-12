import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/utils/styleUtils"

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<React.ComponentRef<typeof AccordionPrimitive.Item>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>>(({ className, ...props }, ref) => (
    <AccordionPrimitive.Item ref={ref} className={cn("group", className)} {...props} />
))
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef<React.ComponentRef<typeof AccordionPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>>(
    ({ className, children, ...props }, ref) => (
        <AccordionPrimitive.Header className="flex">
            <AccordionPrimitive.Trigger
                ref={ref}
                className={cn(
                    "border-b border-divider group-last:data-[state=closed]:border-b-0 flex flex-1 items-center justify-between py-4 px-1 -mx-1 font-medium transition-all hover:[&:not(:focus)]:shadow-[inset_0_-4px_0_rgba(49,21,153,0.25)] focus:outline-none focus:ring-4 focus:ring-ring focus:rounded-sm [&[data-state=open]>svg]:rotate-180",
                    className
                )}
                {...props}
            >
                {children}
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" aria-hidden />
            </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
    )
)
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = React.forwardRef<React.ComponentRef<typeof AccordionPrimitive.Content>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>>(
    ({ className, children, ...props }, ref) => (
        <AccordionPrimitive.Content ref={ref} className="transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down" {...props}>
            <div className={cn("pb-6 pt-4", className)}>{children}</div>
        </AccordionPrimitive.Content>
    )
)

AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
