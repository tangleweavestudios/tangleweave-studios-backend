import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from 'react-oidc-context';
import App from './App';
import './index.css';

const oidcConfig = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY || `${window.location.origin}/auth/v1`,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID || 'backoffice-admin',
  redirect_uri: `${window.location.origin}/callback`,
  response_type: 'code',
  scope: 'openid profile email roles',
  usePushedAuthorizationRequests: false,
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider {...oidcConfig}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
