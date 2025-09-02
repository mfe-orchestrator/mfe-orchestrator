export interface EnvironmentValue {
    environmentId: string;
    value: string;
}

interface GlobalVariableCreateDTO{
    key: string;
    values: EnvironmentValue[];
}

export interface GlobalVariableUpdateDTO{
    key: string;
    originalKey: string;
    values: EnvironmentValue[];
}

export default GlobalVariableCreateDTO