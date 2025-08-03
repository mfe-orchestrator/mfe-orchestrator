export interface Environment {
    id: string;
    slug: string;
    name: string;
    description?: string;
    isProduction: boolean;
    createdAt: Date;
    updatedAt: Date;
}
