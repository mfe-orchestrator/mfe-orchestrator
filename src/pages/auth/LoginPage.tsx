
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, federatedLogin } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const success = await login(email, password);
    
    setIsLoading(false);
    
    if (success) {
      toast({
        title: "Login riuscito",
        description: "Sei stato autenticato correttamente.",
      });
      navigate("/dashboard");
    } else {
      toast({
        variant: "destructive",
        title: "Login fallito",
        description: "Email o password non corretti.",
      });
    }
  };

  const handleFederatedLogin = async (provider: string) => {
    setIsLoading(true);
    
    const success = await federatedLogin(provider);
    
    setIsLoading(false);
    
    if (success) {
      toast({
        title: "Login riuscito",
        description: `Autenticato con ${provider}.`,
      });
      navigate("/dashboard");
    } else {
      toast({
        variant: "destructive",
        title: "Login fallito",
        description: `Non è stato possibile autenticarsi con ${provider}.`,
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="h-12 w-12 rounded-md bg-orchestrator-accent flex items-center justify-center text-white text-xl font-bold">
            MF
          </div>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-center">Accedi</CardTitle>
            <CardDescription className="text-center">
              Inserisci i tuoi dati per accedere al sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="nome@esempio.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link to="/reset-password" className="text-sm text-primary underline-offset-4 hover:underline">
                      Dimenticata?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Accesso in corso..." : "Accedi"}
                </Button>
              </div>
            </form>
            
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">O continua con</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <Button 
                variant="outline" 
                type="button" 
                onClick={() => handleFederatedLogin("Google")}
                disabled={isLoading}
              >
                Google
              </Button>
              <Button 
                variant="outline" 
                type="button" 
                onClick={() => handleFederatedLogin("Microsoft")}
                disabled={isLoading}
              >
                Microsoft
              </Button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              Non hai un account?{" "}
              <Link to="/register" className="text-primary underline-offset-4 hover:underline">
                Registrati
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
