export interface SinglePageHeaderProps extends React.PropsWithChildren {
  title: string;
  description?: string;
  center?: React.ReactNode;
  right?: React.ReactNode;
}

const SinglePageLayout: React.FC<SinglePageHeaderProps> = ({ title, description, center, right, children }) => {
  return (
    <div className="flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground">
            {description}
          </p>}
        </div>
        {center && <div>
          {center}
        </div>}
        {right && <div>
          {right}
        </div>}
      </div>
      {children}
    </div>
  )
}

export default SinglePageLayout