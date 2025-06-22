import React from 'react';
import { twMerge } from 'tailwind-merge';

interface MainLogoProps {
  /**
   * The text to display inside the logo
   * @default 'MF'
   */
  text?: string;
  /**
   * Additional CSS classes to apply to the logo container
   */
  className?: string;
  /**
   * Size of the logo
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-8 w-8 text-base',
  md: 'h-12 w-12 text-xl',
  lg: 'h-16 w-16 text-2xl',
};

/**
 * MainLogo component that displays a simple logo with the given text
 */
export const MainLogo: React.FC<MainLogoProps> = ({
  text = 'MF',
  className = '',
  size = 'md',
}) => {
  const baseClasses = 'rounded-md bg-orchestrator-accent flex items-center justify-center text-white font-bold';
  
  return (
    <div 
      className={twMerge(
        baseClasses,
        sizeClasses[size],
        className
      )}
      data-testid="main-logo"
    >
        {text}
    </div>
  );
};

export default MainLogo;