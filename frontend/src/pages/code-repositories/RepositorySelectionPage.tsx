import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button/button';
import { Badge } from '@/components/ui/badge/badge';
import { Input } from '@/components/ui/input/input';
import { GitBranch, Search, Plus } from 'lucide-react';
import SinglePageLayout from '@/components/SinglePageLayout';
import Spinner from '@/components/Spinner';

interface Repository {
  id: number;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
}

const RepositorySelectionPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const provider = searchParams.get('provider');
  
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRepos, setSelectedRepos] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchRepositories = async () => {
      if (!provider) {
        navigate('/code-repositories');
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/code-repositories/${provider}/repositories`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setRepositories(data.repositories || []);
      } catch (error) {
        console.error('Error fetching repositories:', error);
        // Handle error - maybe redirect back or show error message
      } finally {
        setLoading(false);
      }
    };

    fetchRepositories();
  }, [provider, navigate]);

  const filteredRepositories = repositories.filter(repo =>
    repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    repo.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleRepository = (repoId: number) => {
    const newSelected = new Set(selectedRepos);
    if (newSelected.has(repoId)) {
      newSelected.delete(repoId);
    } else {
      newSelected.add(repoId);
    }
    setSelectedRepos(newSelected);
  };

  const handleAddRepositories = async () => {
    if (selectedRepos.size === 0) return;

    const reposToAdd = repositories.filter(repo => selectedRepos.has(repo.id));
    
    try {
      const response = await fetch('/api/code-repositories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repositories: reposToAdd.map(repo => ({
            name: repo.name,
            fullName: repo.fullName,
            url: repo.htmlUrl,
            provider,
            branch: repo.defaultBranch,
            description: repo.description,
            private: repo.private
          }))
        })
      });

      if (response.ok) {
        navigate('/code-repositories');
      } else {
        throw new Error('Failed to add repositories');
      }
    } catch (error) {
      console.error('Error adding repositories:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <SinglePageLayout
      title={`Select ${provider} Repositories`}
      description="Choose the repositories you want to add to your project"
      right={
        <Button 
          onClick={handleAddRepositories}
          disabled={selectedRepos.size === 0}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add {selectedRepos.size} Repositories
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4" />
            <Input
              placeholder="Search repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredRepositories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'No repositories found matching your search.' : 'No repositories available.'}
              </div>
            ) : (
              filteredRepositories.map((repo) => (
                <Card 
                  key={repo.id}
                  className={`cursor-pointer transition-colors ${
                    selectedRepos.has(repo.id) 
                      ? 'border-primary bg-primary/5' 
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => toggleRepository(repo.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium">{repo.name}</h3>
                          <Badge variant={repo.private ? 'secondary' : 'outline'}>
                            {repo.private ? 'Private' : 'Public'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {repo.fullName}
                        </p>
                        {repo.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {repo.description}
                          </p>
                        )}
                        <div className="flex items-center mt-2 text-sm text-muted-foreground">
                          <GitBranch className="mr-1 h-4 w-4" />
                          {repo.defaultBranch}
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className={`w-4 h-4 rounded border-2 ${
                          selectedRepos.has(repo.id)
                            ? 'bg-primary border-primary'
                            : 'border-muted-foreground'
                        }`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </SinglePageLayout>
  );
};

export default RepositorySelectionPage;