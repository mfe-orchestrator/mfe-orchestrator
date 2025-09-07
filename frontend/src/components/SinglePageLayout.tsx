import { cn } from "@/utils/styleUtils"

export interface SinglePageHeaderProps extends React.PropsWithChildren {
    title: string
    description?: string
    left?: React.ReactNode
    right?: React.ReactNode
    lrContainerClassname?: string
}

const SinglePageLayout: React.FC<SinglePageHeaderProps> = ({ title, description, left, right, children, lrContainerClassname }) => {
    return (
        <div className="flex flex-col space-y-6">
            <div className="mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{title}</h1>
                    {description && <p className="text-primary">{description}</p>}
                </div>
                {(left || right) && (
                    <div className={cn("@container mt-4 flex justify-between items-center gap-y-2 gap-x-4 flex-wrap", lrContainerClassname)}>
                        {left && <>{left}</>}
                        {right && <>{right}</>}
                    </div>
                )}
            </div>
            {children}
        </div>
    )
}

export default SinglePageLayout
