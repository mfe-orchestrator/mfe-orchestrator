
import React from 'react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export type Environment = 'DEV' | 'UAT' | 'PREPROD' | 'PROD';

interface EnvironmentSelectorProps {
  selectedEnvironment: Environment;
  onEnvironmentChange: (value: Environment) => void;
}

const environmentColors = {
  DEV: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
  UAT: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
  PREPROD: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  PROD: 'bg-primary/20 text-primary hover:bg-primary/30',
};

const EnvironmentSelector: React.FC<EnvironmentSelectorProps> = ({ 
  selectedEnvironment, 
  onEnvironmentChange 
}) => {
  return (
    <div className="flex items-center">
      <span className="text-sm font-medium mr-2">Ambiente:</span>
      <Select 
        value={selectedEnvironment} 
        onValueChange={(value) => onEnvironmentChange(value as Environment)}
      >
        <SelectTrigger className="w-[130px] h-9">
          <SelectValue>
            <Badge variant="outline" className={`${environmentColors[selectedEnvironment as Environment]}`}>
              {selectedEnvironment}
            </Badge>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="DEV">
            <Badge variant="outline" className={environmentColors.DEV}>DEV</Badge>
          </SelectItem>
          <SelectItem value="UAT">
            <Badge variant="outline" className={environmentColors.UAT}>UAT</Badge>
          </SelectItem>
          <SelectItem value="PREPROD">
            <Badge variant="outline" className={environmentColors.PREPROD}>PREPROD</Badge>
          </SelectItem>
          <SelectItem value="PROD">
            <Badge variant="outline" className={environmentColors.PROD}>PROD</Badge>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default EnvironmentSelector;
