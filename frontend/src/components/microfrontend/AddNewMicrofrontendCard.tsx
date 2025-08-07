
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { PlusCircle } from 'lucide-react';
import { cn } from '@/utils/styleUtils';

interface AddNewMicrofrontendCardProps {
  onAddNewMicrofrontend: () => void;
  className?: string;
}

const AddNewMicrofrontendCard: React.FC<AddNewMicrofrontendCardProps> = ({ 
  onAddNewMicrofrontend,
  className 
}) => {
  const { t } = useTranslation('platform');

  return (
    <Card 
      className={cn(
        'h-full flex flex-col transition-all duration-200 cursor-pointer',
        'border-2 border-dashed border-muted-foreground/30 hover:border-primary/50',
        'hover:shadow-lg hover:scale-[1.01]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
      onClick={onAddNewMicrofrontend}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAddNewMicrofrontend();
        }
      }}
    >
      <CardContent className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="p-3 mb-4 rounded-full bg-primary/10">
          <PlusCircle className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-1">
          {t('microfrontend.add_new')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('microfrontend.click_to_create')}
        </p>
      </CardContent>
    </Card>
  );
};

export default AddNewMicrofrontendCard;
