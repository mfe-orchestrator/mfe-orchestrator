import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, List, Grid, Plus } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useProjectUserApi from '@/hooks/apiClients/useProjectUserApi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useToastNotificationStore from '@/store/useToastNotificationStore';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import useProjectStore from '@/store/useProjectStore';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Gravatar from 'react-gravatar';

type ViewType = 'table' | 'grid';

const inviteUserSchema = z.object({
  email: z.string().email('Inserisci un indirizzo email valido'),
  role: z.enum(['admin', 'editor', 'viewer'], {
    required_error: 'Seleziona un ruolo per l\'utente',
  }),
});

type InviteUserFormValues = z.infer<typeof inviteUserSchema>;

const ProjectUsersList: React.FC = () => {
  const { t } = useTranslation();
  const { project } = useProjectStore();
  const notifications = useToastNotificationStore();
  const projectUserApi = useProjectUserApi();
  const queryClient = useQueryClient();
  const [viewType, setViewType] = useState<ViewType>('table');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const form = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: '',
      role: 'viewer',
    },
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (values: InviteUserFormValues) => {
      // TODO: Implement the actual API call to invite a user
      console.log('Inviting user:', values);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectUsers', project?._id] });
      notifications.showSuccessNotification({
        message: t('project_users.invite_success'),
      });
      setIsInviteModalOpen(false);
      form.reset();
    },
  });

  const onSubmit = async (values: InviteUserFormValues) => {
    await inviteUserMutation.mutateAsync(values);
  };

  const userQuery = useQuery({
    queryKey: ['projectUsers', project?._id],
    queryFn: () => projectUserApi.getProjectUsers(project?._id || ''),
    enabled: !!project?._id,
  });

  const { data: users = [] } = userQuery;

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => 
      projectUserApi.removeUserFromProject(project?._id || '', userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectUsers', project?._id] });
      notifications.showSuccessNotification({
        message: t('project_users.user_removed'),
      });
    },
  });

  const handleDeleteUser = (userId: string, userName: string) => {
    if (window.confirm(t('project_users.confirm_remove', { name: userName }))) {
      deleteUserMutation.mutate(userId);
    }
  };

  const getUserInitials = (user?: { name?: string; surname?: string; email: string }) => {
    if (!user) return '';
    if (user.name && user.surname) {
      return `${user.name[0]}${user.surname[0]}`.toUpperCase();
    }
    if (user.name) return user.name[0].toUpperCase();
    if (user.surname) return user.surname[0].toUpperCase();
    return user?.email?.[0].toUpperCase();
  };

  const renderTableRow = (user: any) => (
    <TableRow key={user._id}>
      <TableCell className="flex items-center space-x-3">
        <Avatar className="h-8 w-8">
          <Gravatar email={user.email} className="rounded-full" />
          <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
        </Avatar>
        <div>
          <div className="font-medium">
            {user.name || user.surname 
              ? `${user.name || ''} ${user.surname || ''}`.trim()
              : t('project_users.no_name')}
          </div>
          <div className="text-sm text-muted-foreground">{user.email}</div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{user.role}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleDeleteUser(user._id, user.name || user.email)}
          disabled={deleteUserMutation.isPending}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );

  const renderUserCard = (user: any) => (
    <Card key={user._id} className="w-full sm:w-[300px] h-full">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center space-y-4">
          <Avatar className="h-20 w-20">
            <Gravatar email={user.email} className="rounded-full" />
            <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
          </Avatar>
          <div className="text-center space-y-1">
            <h3 className="text-lg font-medium">
              {user.name || user.surname 
                ? `${user.name || ''} ${user.surname || ''}`.trim()
                : t('project_users.no_name')}
            </h3>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <Badge variant="outline" className="mt-2">
              {user.role}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => handleDeleteUser(user._id, user.name || user.email)}
            disabled={deleteUserMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4 text-destructive" />
            {t('common.remove')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (users.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('project_users.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center py-8 text-muted-foreground">
            {t('project_users.no_users')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ApiDataFetcher queries={[userQuery]}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-xl font-bold">
              {t('project_users.title')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('project_users.subtitle', { count: users.length })}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="ml-2">
              {t('project_users.count', { count: users.length })}
            </Badge>
            <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="ml-2">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('project_users.invite_user')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)}>
                    <DialogHeader>
                      <DialogTitle>{t('project_users.invite_user_modal_title')}</DialogTitle>
                      <DialogDescription>
                        {t('project_users.invite_user_modal_description')}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('auth.email')}</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t('auth.email_placeholder')}
                                type="email"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('project_users.role')}</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('project_users.select_role')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="admin">
                                  {t('project_users.roles.admin')}
                                </SelectItem>
                                <SelectItem value="editor">
                                  {t('project_users.roles.editor')}
                                </SelectItem>
                                <SelectItem value="viewer">
                                  {t('project_users.roles.viewer')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsInviteModalOpen(false)}
                        disabled={inviteUserMutation.isPending}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button
                        type="submit"
                        disabled={inviteUserMutation.isPending}
                      >
                        {inviteUserMutation.isPending ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          t('project_users.send_invitation')
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs 
            defaultValue="table" 
            className="space-y-4"
            onValueChange={(value) => setViewType(value as ViewType)}
          >
            <div className="flex justify-end">
              <TabsList>
                <TabsTrigger value="table">
                  {t('project_users.table_view')}
                </TabsTrigger>
                <TabsTrigger value="grid">
                  {t('project_users.grid_view')}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="table" className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('project_users.user')}</TableHead>
                      <TableHead>{t('project_users.role')}</TableHead>
                      <TableHead className="w-[100px]">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(user => renderTableRow(user))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="grid" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {users.map(user => renderUserCard(user))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </ApiDataFetcher>
  );
};

export default ProjectUsersList;