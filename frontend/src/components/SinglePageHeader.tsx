
interface SinglePageHeaderProps {
  title: string;
  description: string;
  center?: React.ReactNode;
  buttons?: React.ReactNode;
}

const SinglePageHeader: React.FC<SinglePageHeaderProps> = ({ title, description, center, buttons }) => {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">
          {description}
        </p>
      </div>
      {center && <div>
        {center}
      </div>}
      {buttons && <div>
        {buttons}
      </div>}
    </div>
  )
}

export default SinglePageHeader