import { Button as DesignSystemButton, type IButtonProps } from "@mfe-orchestrator/design-system"
import { forwardRef } from "react"
import { Link } from "react-router-dom"

/**
 * Button del design system collegato al router dell'app: con `href` la
 * navigazione resta client-side invece di ricaricare la pagina.
 *
 * Inoltra il ref perche' i trigger di Radix (`asChild` di Dialog, DropdownMenu)
 * ne hanno bisogno per ancorare il pannello e gestire il focus: senza, il ref si
 * fermerebbe qui e React segnalerebbe il componente come non referenziabile.
 */
export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, IButtonProps>((props, ref) => (
    <DesignSystemButton
        ref={ref}
        renderLink={({ href, className, children, id, dataTestId }) => (
            <Link to={href} className={className} id={id} data-testid={dataTestId}>
                {children}
            </Link>
        )}
        {...props}
    />
))

Button.displayName = "Button"

export default Button
