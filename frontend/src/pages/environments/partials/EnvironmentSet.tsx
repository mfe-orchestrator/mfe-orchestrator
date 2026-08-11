import { GlobeAltIcon } from "@heroicons/react/24/outline"
import { Card } from "@mfe-orchestrator/design-system"
import { Badge } from "@/components/atoms"
import { EnvironmentPreset } from "@/utils/EnviromentsPresets"

interface EnvironmentSetProps {
    name: string
    environments: EnvironmentPreset[]
    onClick: (environment: EnvironmentPreset[]) => void
}

export const EnvironmentSet: React.FC<EnvironmentSetProps> = ({ name, environments, onClick }) => {
    return (
        <Card
            onClick={() => onClick(environments)}
            data-testid={`environment-preset-${name}`}
            className="relative flex-[1_1_240px] cursor-pointer flex gap-4 items-center flex-wrap hover:bg-primary/15"
        >
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
                <GlobeAltIcon className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
                <h4 className="text-normal font-medium text-card-foreground">{name}</h4>
                <div className="flex flex-wrap gap-2 mt-2">
                    {environments.map((env, i) => (
                        <Badge key={i} style={{ backgroundColor: `${env.color}BF` }}>
                            {env.slug}
                        </Badge>
                    ))}
                </div>
            </div>
        </Card>
    )
}

export default EnvironmentSet
