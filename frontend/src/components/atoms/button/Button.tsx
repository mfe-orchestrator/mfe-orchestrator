import { Button as DesignSystemButton, type IButtonProps } from "@mfe-orchestrator/design-system"
import type React from "react"
import { Link } from "react-router-dom"

/**
 * Button del design system collegato al router dell'app: con `href` la
 * navigazione resta client-side invece di ricaricare la pagina.
 */
export const Button: React.FC<IButtonProps> = props => (
    <DesignSystemButton
        renderLink={({ href, className, children, id, dataTestId }) => (
            <Link to={href} className={className} id={id} data-testid={dataTestId}>
                {children}
            </Link>
        )}
        {...props}
    />
)

Button.displayName = "Button"

export default Button
