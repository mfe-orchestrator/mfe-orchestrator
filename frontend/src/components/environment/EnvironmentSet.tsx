import { EnvironmentPreset } from "@/utils/EnviromentsPresets";
import { PlusCircleIcon } from "@heroicons/react/24/outline";

interface EnvironmentSetProps{
    name: string;
    environments: EnvironmentPreset[];
    onClick: (environment: EnvironmentPreset[]) => void;
}

const EnvironmentSet : React.FC<EnvironmentSetProps> = ({ name, environments, onClick }) => {
    return (
        <div
              onClick={() => onClick(environments)}
              className="relative rounded-lg border bg-card px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-primary/20 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary cursor-pointer"
            >
              <div className="flex-shrink-0">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <PlusCircleIcon className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-card-foreground">{name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {environments.map((env, i) => (
                    <span 
                      key={i}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-black"
                      style={{ backgroundColor: env.color }}
                    >
                      {env.slug}
                    </span>
                  ))}
                </div>
              </div>
            </div>
    )
}

export default EnvironmentSet