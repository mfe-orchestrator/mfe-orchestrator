
import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

export interface MicrofrontendProps {
  id: string;
  name: string;
  version: string;
  description: string;
  status: 'active' | 'inactive' | 'error';
  lastUpdated: string;
  parameters?: Record<string, string>;
}

const MicrofrontendCard: React.FC<{ mfe: MicrofrontendProps }> = ({ mfe }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [parameters, setParameters] = useState<Record<string, string>>(mfe.parameters || {});
  const { toast } = useToast();

  const statusColor = {
    active: 'bg-green-500',
    inactive: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  const handleParameterChange = (key: string, value: string) => {
    setParameters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const addParameter = () => {
    setParameters(prev => ({
      ...prev,
      [`param${Object.keys(parameters).length + 1}`]: ''
    }));
  };

  const saveParameters = () => {
    // Here you would typically save the parameters to your backend
    toast({
      title: "Parametri salvati",
      description: `I parametri per ${mfe.name} sono stati aggiornati.`,
    });
    setIsDialogOpen(false);
  };

  return (
    <>
      <Card className="h-full flex flex-col hover:shadow-md transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg font-medium">{mfe.name}</CardTitle>
            <Badge 
              className={`${statusColor[mfe.status]} text-white`}
            >
              {mfe.status === 'active' ? 'Attivo' : mfe.status === 'inactive' ? 'Inattivo' : 'Errore'}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">Versione: {mfe.version}</div>
        </CardHeader>
        <CardContent className="flex-grow">
          <p className="text-sm">{mfe.description}</p>
        </CardContent>
        <CardFooter className="flex justify-between items-center border-t pt-4">
          <div className="text-xs text-muted-foreground">
            Ultimo aggiornamento: {mfe.lastUpdated}
          </div>
          <Button size="sm" variant="outline" onClick={() => setIsDialogOpen(true)}>
            Configurazione
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurazione parametri: {mfe.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {Object.keys(parameters).map((key) => (
              <div key={key} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={key} className="text-right col-span-1">
                  {key}
                </Label>
                <Input
                  id={key}
                  value={parameters[key]}
                  onChange={(e) => handleParameterChange(key, e.target.value)}
                  className="col-span-3"
                />
              </div>
            ))}
            
            <div className="flex justify-between mt-4">
              <Button type="button" variant="outline" size="sm" onClick={addParameter}>
                Aggiungi parametro
              </Button>
              <Button type="button" onClick={saveParameters}>
                Salva configurazione
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MicrofrontendCard;
