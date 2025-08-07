import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/styleUtils';

type SpinnerProps = {
  className?: string;
  size?: number;
  centerScreen?: boolean;
};

const Spinner = ({
  className,
  size = 24,
  centerScreen = true,
}: SpinnerProps) => {
  const spinner = (
    <Loader2 
      className={cn('animate-spin', className)} 
      size={size}
      aria-label="Caricamento in corso"
    />
  );

  if (!centerScreen) return spinner;

  return (
    <div 
      className="flex-1 flex items-center justify-center"
      aria-live="polite"
      aria-busy="true"
    >
      {spinner}
    </div>
  );
};

export default Spinner;
