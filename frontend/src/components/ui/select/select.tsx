import * as SelectPrimitive from "@radix-ui/react-select"
import { VariantProps } from "class-variance-authority"
import * as React from "react"
import { selectTriggerVariants } from "./partials/selectTrigger/selecTriggerVariants"

const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement>, VariantProps<typeof selectTriggerVariants> {}

const SelectContext = React.createContext<SelectProps>({})

const Select = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root> & SelectProps>(
    ({ children, layoutSize, fullWidth, ...props }) => {
        const selectProps = React.useMemo(() => ({ layoutSize, fullWidth, ...props }), [layoutSize, fullWidth, props])

        return (
            <SelectContext.Provider value={selectProps}>
                <SelectPrimitive.Root {...props}>{children}</SelectPrimitive.Root>
            </SelectContext.Provider>
        )
    }
)

export { Select, SelectContext, SelectGroup, SelectValue }
