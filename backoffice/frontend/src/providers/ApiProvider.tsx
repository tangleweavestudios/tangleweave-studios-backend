import { useAuth } from 'react-oidc-context';
import { useEffect } from 'react';
import { OpenAPI } from '../api';

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  useEffect(() => {
    if (auth.isAuthenticated && auth.user?.access_token) {
      OpenAPI.TOKEN = auth.user.access_token;
    } else {
      OpenAPI.TOKEN = undefined;
    }
  }, [auth.isAuthenticated, auth.user?.access_token]);

  return <>{children}</>;
}
