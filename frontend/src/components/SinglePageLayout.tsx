import SinglePageHeader from "./SinglePageHeader";

interface SinglePageHeaderProps extends React.PropsWithChildren {
  title: string;
  description?: string;
  center?: React.ReactNode;
  right?: React.ReactNode;
}

const SinglePageLayout: React.FC<SinglePageHeaderProps> = ({ title, description, center, right, children }) => {
  return (
    <div className="flex flex-col space-y-6">
      <SinglePageHeader
        title={title}
        description={description}
        center={center}
        buttons={right}
      />
        {children}
    </div>
  )
}

export default SinglePageLayout