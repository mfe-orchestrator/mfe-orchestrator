import { VariantProps } from "class-variance-authority"
import { ButtonVariants } from "./ButtonVariants"

export interface IButtonProps extends React.HTMLAttributes<HTMLButtonElement | HTMLAnchorElement>, VariantProps<typeof ButtonVariants> {
    asChild?: boolean
    href?: string
    disabled?: boolean
    type?: "button" | "submit" | "reset"
    dataTestId?: string
}
