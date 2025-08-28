
import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Percent } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import useToastNotificationStore from '@/store/useToastNotificationStore';
import { Microfrontend } from '@/hooks/apiClients/useMicrofrontendsApi';
import { useNavigate } from 'react-router-dom';


interface MicrofrontendCardProps {
  mfe: Microfrontend;
}

const MicrofrontendCard: React.FC<MicrofrontendCardProps> = ({ mfe }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const navigate = useNavigate()
  
  // Get environment-specific data or fall back to default
  const envData = mfe.environmentVariables;
  const version = envData?.version || mfe.version;
  //const canaryPercentage = envData?.canaryPercentage || mfe.canaryPercentage || 0;
  const parameters = envData?.parameters || mfe.parameters || {};
  
  const [editParameters, setEditParameters] = useState<Record<string, string>>(null);
  const [editCanaryPercentage, setEditCanaryPercentage] = useState<number>(null);
  const notifications = useToastNotificationStore()

  const statusColor = {
    active: 'bg-green-500',
    inactive: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  const handleParameterChange = (key: string, value: string) => {
    setEditParameters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const addParameter = () => {
    setEditParameters(prev => ({
      ...prev,
      [`param${Object.keys(editParameters).length + 1}`]: ''
    }));
  };

  const saveConfiguration = () => {
    // Here you would typically save the parameters to your backend
    notifications.showSuccessNotification({
      message: `I parametri per ${mfe.name} sono stati aggiornati.`
    })
    setIsDialogOpen(false);
  };

  const canaryPercentage = 38

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
          <div className="text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Versione {version}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-grow">
          <p className="text-sm">{mfe.description}</p>
          {canaryPercentage > 0 && (
            <div className="mt-3 p-2 bg-orange-100 rounded-md text-sm">
              <div className="font-semibold flex items-center text-orange-700">
                <Percent className="mr-1 h-4 w-4" /> Canary Release
              </div>
              <div className="text-orange-600">
                Attiva per il {canaryPercentage}% degli utenti
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between items-center border-t pt-4">
          <Button size="sm" variant="outline" onClick={() => navigate(`/microfronted/${mfe._id}`)}>
            Configurazione
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Configurazione: {mfe.name}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="general">Generale</TabsTrigger>
              <TabsTrigger value="parameters">Parametri</TabsTrigger>
            </TabsList>
            
            <TabsContent value="general">
              <div className="space-y-4 py-2">
                <div className="border-b pb-4">
                  <Label className="mb-2 block font-medium">
                    Canary Release
                  </Label>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Percentuale di utenti:</span>
                      <Badge variant="outline" className="font-mono">
                        {editCanaryPercentage}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[editCanaryPercentage]}
                        max={100}
                        step={5}
                        onValueChange={(value) => setEditCanaryPercentage(value[0])}
                        className="flex-1"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      La versione {version} sarà visibile solo a questa percentuale di utenti in ambiente.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="parameters">
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label className="font-medium">Parametri di configurazione</Label>
                  {Object.keys(editParameters || {}).map((key) => (
                    <div key={key} className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor={key} className="text-right col-span-1">
                        {key}
                      </Label>
                      <Input
                        id={key}
                        value={editParameters[key]}
                        onChange={(e) => handleParameterChange(key, e.target.value)}
                        className="col-span-3"
                      />
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addParameter}>
                  Aggiungi parametro
                </Button>
              </div>
            </TabsContent>
          </Tabs>
          
          <div className="flex justify-end mt-4">
            <Button type="button" onClick={saveConfiguration}>
              Salva configurazione
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MicrofrontendCard;
