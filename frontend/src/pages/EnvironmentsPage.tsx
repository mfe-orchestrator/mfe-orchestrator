import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import useEnvironmentsApi from '@/hooks/apiClients/useEnvironmentsApi';
import useToastNotificationStore from '@/store/useToastNotificationStore';
import useProjectStore from '@/store/useProjectStore';
import { useQuery } from '@tanstack/react-query';
import useProjectApi from '@/hooks/apiClients/useProjectApi';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import NoEnvironmentPlaceholder from '@/components/environment/NoEnvironmentPlaceholder';
import SinglePageHeader from '@/components/SinglePageHeader';
import { Card } from '@/components/ui/card';

type Environment = {
    _id: string;
    name: string;
    slug: string;
    description?: string;
    color?: string;
    isProduction?: boolean;
};

export default function EnvironmentsPage() {
    const notifications = useToastNotificationStore();
    const {
        createEnvironment,
        editEnvironment,
        deleteEnvironment
    } = useEnvironmentsApi();
    const projectApi = useProjectApi();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [currentEnvironment, setCurrentEnvironment] = useState<Partial<Environment> | null>(null);
    const { project } = useProjectStore();
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        description: '',
        color: '#3b82f6',
        isProduction: false,
    });

    const environmentQuery = useQuery({
        queryKey: ['environments', project._id],
        queryFn: () => projectApi.getEnvironmentsByProjectId(project._id),
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            //   if (currentEnvironment?._id) {
            //     await editEnvironment(currentEnvironment._id, formData);
            //     toast({
            //       title: 'Success',
            //       description: 'Environment updated successfully',
            //     });
            //   } else {
            //     await createEnvironment(formData);
            //     toast({
            //       title: 'Success',
            //       description: 'Environment created successfully',
            //     });
            //   }
            //   setIsDialogOpen(false);
            //   fetchEnvironments();
        } catch (error) {
            //   toast({
            //     title: 'Error',
            //     description: `Failed to ${currentEnvironment?._id ? 'update' : 'create'} environment`,
            //     variant: 'destructive',
            //   });
        }
    };

    const handleEdit = (env: Environment) => {
        setCurrentEnvironment(env);
        setFormData({
            name: env.name,
            slug: env.slug,
            description: env.description || '',
            color: env.color || '#3b82f6',
            isProduction: env.isProduction || false,
        });
        setIsDialogOpen(true);
    };

    const handleDelete = async () => {
        if (!currentEnvironment?._id) return;

        // try {
        //   await deleteEnvironment(currentEnvironment._id);
        //   toast({
        //     title: 'Success',
        //     description: 'Environment deleted successfully',
        //   });
        //   setIsDeleteDialogOpen(false);
        //   fetchEnvironments();
        // } catch (error) {
        //   toast({
        //     title: 'Error',
        //     description: 'Failed to delete environment',
        //     variant: 'destructive',
        //   });
        // }
    };

    const openCreateDialog = () => {
        setCurrentEnvironment(null);
        setFormData({
            name: '',
            slug: '',
            description: '',
            color: '#3b82f6',
            isProduction: false,
        });
        setIsDialogOpen(true);
    };

    const onSaveEnvironmentsSuccess = () => {
        environmentQuery.refetch();
    }

    return (
        <div>
            <SinglePageHeader
                title="Environments"
                description="Gestisci gli ambienti del tuo progetto"
                buttons={
                    <Button onClick={openCreateDialog}>
                        <Plus className="mr-2 h-4 w-4" />
                        New Environment
                    </Button>
                }
            />
            <Card className="mt-6">
                <ApiDataFetcher queries={[environmentQuery]}>
                    {!environmentQuery.data || environmentQuery.data.length == 0 ?
                        <NoEnvironmentPlaceholder onSaveSuccess={onSaveEnvironmentsSuccess} />
                        :
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Slug</TableHead>
                                    <TableHead>Production</TableHead>
                                    <TableHead>Color</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {environmentQuery.data?.map((env) => (
                                    <TableRow key={env._id}>
                                        <TableCell className="font-medium">{env.name}</TableCell>
                                        <TableCell>{env.slug}</TableCell>
                                        <TableCell>{env.isProduction ? 'Yes' : 'No'}</TableCell>
                                        <TableCell>
                                            <div
                                                className="w-6 h-6 rounded-full border"
                                                style={{ backgroundColor: env.color }}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEdit(env)}
                                                className="mr-2"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setCurrentEnvironment(env);
                                                    setIsDeleteDialogOpen(true);
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    }
                </ApiDataFetcher>

                {/* Create/Edit Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {currentEnvironment?._id ? 'Edit Environment' : 'Create New Environment'}
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="slug">Slug</Label>
                                <Input
                                    id="slug"
                                    name="slug"
                                    value={formData.slug}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="description">Description</Label>
                                <Input
                                    id="description"
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                />
                            </div>
                            <div>
                                <Label htmlFor="color">Color</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        id="color"
                                        name="color"
                                        type="color"
                                        value={formData.color}
                                        onChange={handleInputChange}
                                        className="w-16 h-10 p-1"
                                    />
                                    <span>{formData.color}</span>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    id="isProduction"
                                    name="isProduction"
                                    type="checkbox"
                                    checked={formData.isProduction}
                                    onChange={handleInputChange}
                                    className="h-4 w-4"
                                />
                                <Label htmlFor="isProduction">Production Environment</Label>
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="secondary" onClick={() => setIsDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit">
                                    {currentEnvironment?._id ? 'Update' : 'Create'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete Environment</DialogTitle>
                        </DialogHeader>
                        <p>Are you sure you want to delete the environment "{currentEnvironment?.name}"?</p>
                        <DialogFooter>
                            <Button variant="secondary" onClick={() => setIsDeleteDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button variant="destructive" onClick={handleDelete}>
                                Delete
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </Card>
        </div>
    );
}
