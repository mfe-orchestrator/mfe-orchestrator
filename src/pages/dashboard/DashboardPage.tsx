
import { useState, useEffect } from 'react';
import MainLayout from '../../components/layout/MainLayout';
import MicrofrontendCard, { MicrofrontendProps } from '../../components/microfrontend/MicrofrontendCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';

const DashboardPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [microfrontends, setMicrofrontends] = useState<MicrofrontendProps[]>([]);

  // Mock data loading
  useEffect(() => {
    setTimeout(() => {
      setMicrofrontends([
        {
          id: 'mfe-1',
          name: 'Gestione Utenti',
          version: '1.2.3',
          description: 'Modulo per la gestione degli utenti e dei loro permessi all\'interno del sistema.',
          status: 'active',
          lastUpdated: '2023-05-10',
          parameters: {
            apiEndpoint: 'https://api.example.com/users',
            maxUsers: '100'
          }
        },
        {
          id: 'mfe-2',
          name: 'Dashboard Analytics',
          version: '0.9.1',
          description: 'Visualizza metriche e analytics relative all\'utilizzo del sistema.',
          status: 'active',
          lastUpdated: '2023-05-08',
          parameters: {
            refreshInterval: '30',
            dataSource: 'analytics-api'
          }
        },
        {
          id: 'mfe-3',
          name: 'Gestione Documenti',
          version: '2.1.0',
          description: 'Sistema di archiviazione e gestione documentale integrato.',
          status: 'inactive',
          lastUpdated: '2023-04-25'
        },
        {
          id: 'mfe-4',
          name: 'Notifiche',
          version: '1.0.5',
          description: 'Sistema di notifiche in tempo reale per gli utenti.',
          status: 'error',
          lastUpdated: '2023-05-12'
        },
        {
          id: 'mfe-5',
          name: 'Calendario',
          version: '3.2.1',
          description: 'Gestione eventi e appuntamenti con vista calendario.',
          status: 'active',
          lastUpdated: '2023-05-01'
        },
        {
          id: 'mfe-6',
          name: 'Rapporti',
          version: '1.3.7',
          description: 'Generazione di report e statistiche personalizzabili.',
          status: 'active',
          lastUpdated: '2023-05-09'
        }
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  // Filter microfrontends based on search term and status
  const filteredMicrofrontends = microfrontends.filter(mfe => {
    const matchesSearch = mfe.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          mfe.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || mfe.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Count microfrontends by status
  const counts = {
    all: microfrontends.length,
    active: microfrontends.filter(mfe => mfe.status === 'active').length,
    inactive: microfrontends.filter(mfe => mfe.status === 'inactive').length,
    error: microfrontends.filter(mfe => mfe.status === 'error').length
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tight">
            Microfrontend
            <Badge variant="outline" className="ml-2">
              {counts.all}
            </Badge>
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca microfrontend..."
                className="pl-8 w-full md:w-[250px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtra per stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti ({counts.all})</SelectItem>
                <SelectItem value="active">Attivi ({counts.active})</SelectItem>
                <SelectItem value="inactive">Inattivi ({counts.inactive})</SelectItem>
                <SelectItem value="error">Errore ({counts.error})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="grid" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="grid">Griglia</TabsTrigger>
              <TabsTrigger value="list">Lista</TabsTrigger>
            </TabsList>
            <Button variant="outline">Aggiungi Microfrontend</Button>
          </div>
          
          <TabsContent value="grid" className="space-y-4">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <span className="loader"></span>
              </div>
            ) : filteredMicrofrontends.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredMicrofrontends.map((mfe) => (
                  <MicrofrontendCard key={mfe.id} mfe={mfe} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground mb-4">Nessun microfrontend trovato</p>
                <Button variant="outline" onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}>
                  Reimposta filtri
                </Button>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="list">
            <div className="rounded-md border">
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead>
                    <tr className="border-b transition-colors hover:bg-muted/50">
                      <th className="h-12 px-4 text-left align-middle font-medium">Nome</th>
                      <th className="h-12 px-4 text-left align-middle font-medium">Versione</th>
                      <th className="h-12 px-4 text-left align-middle font-medium hidden md:table-cell">Descrizione</th>
                      <th className="h-12 px-4 text-left align-middle font-medium">Stato</th>
                      <th className="h-12 px-4 text-left align-middle font-medium">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center">
                          <span className="loader mx-auto"></span>
                        </td>
                      </tr>
                    ) : filteredMicrofrontends.map((mfe) => (
                      <tr key={mfe.id} className="border-b transition-colors hover:bg-muted/50">
                        <td className="p-4 align-middle font-medium">{mfe.name}</td>
                        <td className="p-4 align-middle">{mfe.version}</td>
                        <td className="p-4 align-middle hidden md:table-cell">
                          <div className="line-clamp-1">{mfe.description}</div>
                        </td>
                        <td className="p-4 align-middle">
                          <Badge 
                            variant="outline"
                            className={`
                              ${mfe.status === 'active' ? 'bg-green-500' : 
                                mfe.status === 'inactive' ? 'bg-yellow-500' : 'bg-red-500'} 
                              text-white
                            `}
                          >
                            {mfe.status === 'active' ? 'Attivo' : 
                             mfe.status === 'inactive' ? 'Inattivo' : 'Errore'}
                          </Badge>
                        </td>
                        <td className="p-4 align-middle">
                          <Button variant="outline" size="sm">Configurazione</Button>
                        </td>
                      </tr>
                    ))}
                    
                    {!loading && filteredMicrofrontends.length === 0 && (
                      <tr>
                        <td colSpan={5} className="h-24 text-center text-muted-foreground">
                          Nessun microfrontend trovato
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default DashboardPage;
