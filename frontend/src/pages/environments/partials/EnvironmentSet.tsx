import { GlobeAltIcon } from "@heroicons/react/24/outline"
import { Card, IconTile } from "@mfe-orchestrator/design-system"
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
            <IconTile size="sm" icon={<GlobeAltIcon />} className="flex-shrink-0" />
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
