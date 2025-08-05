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
  import { Trash2, List, Grid, Plus } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { useTranslation } from 'react-i18next';
  import { useState } from 'react';
  import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import useToastNotificationStore from '@/store/useToastNotificationStore';

  const inviteUserSchema = z.object({
    email: z.string().email('Inserisci un indirizzo email valido'),
    role: z.enum(['admin', 'editor', 'viewer'], {
      required_error: 'Seleziona un ruolo per l\'utente',
    }),
  });

  type InviteUserFormValues = z.infer<typeof inviteUserSchema>;
  

interface AddUserButtonProps {
    onSuccess?: () => void;
}

export const AddUserButton: React.FC<AddUserButtonProps> = ({ onSuccess }) => {
    const { t } = useTranslation();
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const notifications = useToastNotificationStore();

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
          notifications.showSuccessNotification({
            message: t('project_users.invite_success'),
          });
          setIsInviteModalOpen(false);
          onSuccess?.();
          form.reset();
        },
      });
    
      const onSubmit = async (values: InviteUserFormValues) => {
        await inviteUserMutation.mutateAsync(values);
      };
    

    return <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
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
}