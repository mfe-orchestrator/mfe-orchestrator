
import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Slider } from '@/components/ui/slider';
import { Percent, Settings, Plus, Trash2 } from 'lucide-react';
import { Environment } from '../environment/EnvironmentSelector';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface MicrofrontendProps {
  id: string;
  name: string;
  version: string;
  description: string;
  status: 'active' | 'inactive' | 'error';
  lastUpdated: string;
  parameters?: Record<string, string>;
  canaryPercentage?: number;
  environmentVariables?: Record<string, string>;
  environments?: Partial<Record<Environment, { 
    version: string, 
    canaryPercentage?: number, 
    parameters?: Record<string, string>,
    environmentVariables?: Record<string, string>
  }>>;
}

interface MicrofrontendCardProps {
  mfe: MicrofrontendProps;
  currentEnvironment: Environment;
}

const MicrofrontendCard: React.FC<MicrofrontendCardProps> = ({ mfe, currentEnvironment }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Get environment-specific data or fall back to default
  const envData = mfe.environments?.[currentEnvironment];
  const version = envData?.version || mfe.version;
  const canaryPercentage = envData?.canaryPercentage || mfe.canaryPercentage || 0;
  const parameters = envData?.parameters || mfe.parameters || {};
  const environmentVariables = envData?.environmentVariables || mfe.environmentVariables || {};
  
  const [editParameters, setEditParameters] = useState<Record<string, string>>(parameters);
  const [editCanaryPercentage, setEditCanaryPercentage] = useState<number>(canaryPercentage);
  const [editEnvironmentVars, setEditEnvironmentVars] = useState<Record<string, string>>(environmentVariables);
  const [newEnvKey, setNewEnvKey] = useState<string>('');
  const [newEnvValue, setNewEnvValue] = useState<string>('');
  const { toast } = useToast();

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

  const handleEnvVarChange = (key: string, value: string) => {
    setEditEnvironmentVars(prev => ({
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

  const addEnvironmentVariable = () => {
    if (newEnvKey.trim() === '') return;
    
    setEditEnvironmentVars(prev => ({
      ...prev,
      [newEnvKey]: newEnvValue
    }));
    
    setNewEnvKey('');
    setNewEnvValue('');
  };

  const removeEnvironmentVariable = (key: string) => {
    setEditEnvironmentVars(prev => {
      const updated = {...prev};
      delete updated[key];
      return updated;
    });
  };

  const saveConfiguration = () => {
    // Here you would typically save the parameters to your backend
    toast({
      title: "Configurazione salvata",
      description: `I parametri per ${mfe.name} (${currentEnvironment}) sono stati aggiornati.`,
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
          <div className="text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Versione {version}</span>
              <Badge variant="outline" className="ml-2">{currentEnvironment}</Badge>
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
          {Object.keys(environmentVariables).length > 0 && (
            <div className="mt-3 p-2 bg-blue-100 rounded-md text-sm">
              <div className="font-semibold flex items-center text-blue-700">
                <Settings className="mr-1 h-4 w-4" /> Variabili d'ambiente
              </div>
              <div className="text-blue-600">
                {Object.keys(environmentVariables).length} variabili configurate
              </div>
            </div>
          )}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Configurazione: {mfe.name} ({currentEnvironment})
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="general">Generale</TabsTrigger>
              <TabsTrigger value="parameters">Parametri</TabsTrigger>
              <TabsTrigger value="env-vars">Variabili d'ambiente</TabsTrigger>
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
                      La versione {version} sarà visibile solo a questa percentuale di utenti in ambiente {currentEnvironment}.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="parameters">
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label className="font-medium">Parametri di configurazione</Label>
                  {Object.keys(editParameters).map((key) => (
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
            
            <TabsContent value="env-vars">
              <div className="space-y-4 py-2">
                <div>
                  <Label className="font-medium">Variabili d'ambiente</Label>
                  <p className="text-xs text-muted-foreground mb-4">
                    Inserisci le coppie chiave/valore per configurare l'ambiente {currentEnvironment}.
                  </p>
                  
                  {Object.keys(editEnvironmentVars).length > 0 ? (
                    <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                      {Object.entries(editEnvironmentVars).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{key}</div>
                            <div className="text-sm text-muted-foreground">
                              {value.length > 20 ? value.substring(0, 20) + '...' : value}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => removeEnvironmentVariable(key)}
                              title="Rimuovi variabile"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-4 text-muted-foreground border rounded-md mb-4">
                      Nessuna variabile d'ambiente configurata
                    </div>
                  )}
                  
                  <div className="flex flex-col space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <Label htmlFor="env-key">Chiave</Label>
                        <Input
                          id="env-key"
                          placeholder="APP_API_URL"
                          value={newEnvKey}
                          onChange={(e) => setNewEnvKey(e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="env-value">Valore</Label>
                        <div className="flex gap-2">
                          <Input
                            id="env-value"
                            placeholder="https://api.example.com"
                            value={newEnvValue}
                            onChange={(e) => setNewEnvValue(e.target.value)}
                            className="flex-1"
                          />
                          <Button 
                            variant="secondary"
                            size="icon"
                            onClick={addEnvironmentVariable}
                            disabled={newEnvKey.trim() === ''}
                            title="Aggiungi variabile"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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
