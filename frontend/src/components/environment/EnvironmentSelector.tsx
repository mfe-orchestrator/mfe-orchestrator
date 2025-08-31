
import React from 'react';

import { Badge } from "@/components/ui/badge"
import { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import { useTranslation } from "react-i18next"
import { SelectTrigger } from "../ui/select/partials/selectTrigger/selectTrigger"
import { Select, SelectValue } from "../ui/select/select"
import { SelectItem } from "../ui/select/partials/selectItem/selectItem"
import { SelectContent } from "../ui/select/partials/selectContent/selectContent"

interface EnvironmentSelectorProps {
  selectedEnvironment: EnvironmentDTO;
  environments: EnvironmentDTO[];
  onEnvironmentChange: (value: EnvironmentDTO) => void;
}

const environmentColors = {
  DEV: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
  UAT: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
  PREPROD: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  PROD: 'bg-primary/20 text-primary hover:bg-primary/30',
};

const EnvironmentSelector: React.FC<EnvironmentSelectorProps> = ({ 
  selectedEnvironment, 
  environments,
  onEnvironmentChange 
}) => {

  const { t } = useTranslation()
  return (
    <div className="flex items-center">
      <span className="text-sm font-medium mr-2">Ambiente:</span>
      <Select 
        value={selectedEnvironment?._id} 
        onValueChange={(value) => {
          onEnvironmentChange(environments.find(env => env._id === value))
        }}
      >
        {selectedEnvironment &&
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue>
              <Badge variant="outline"  style={{ backgroundColor: selectedEnvironment.color }}>
                {selectedEnvironment.slug}
              </Badge>
            </SelectValue>
          </SelectTrigger>
        }
        {environments &&
          <SelectContent>
            {environments.map((environment) => (
              <SelectItem key={environment._id} value={environment._id}>
                <Badge variant="outline" style={{ backgroundColor: environment.color }}>
                  {environment.slug}
                </Badge>
              </SelectItem>
            ))}
          </SelectContent>
        }
      </Select>
    </div>
  );
};

export default EnvironmentSelector;
