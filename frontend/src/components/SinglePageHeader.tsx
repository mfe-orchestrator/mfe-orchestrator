
interface SinglePageHeaderProps {
    title: string;
    description: string;
    buttons?: React.ReactNode;
}

const SinglePageHeader : React.FC<SinglePageHeaderProps> = ({ title, description, buttons }) => {
    return (
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">
            {description}
          </p>
        </div>
        {buttons}
      </div>
    )
}

export default SinglePageHeader