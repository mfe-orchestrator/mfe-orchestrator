export interface Microfrontend {
    id: string;
    slug: string;
    name: string;
    projectId: string;
    environmentId: string;
    version: string;
    entryPoint: string;
    status: 'active' | 'inactive' | 'archived';
    createdAt: Date;
    updatedAt: Date;
    metadata?: Record<string, any>;
}
