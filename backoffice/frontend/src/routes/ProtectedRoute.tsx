import { useAuth } from 'react-oidc-context';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, Button, CircularProgress, Typography, Paper } from '@mui/material';

interface CustomProfile {
  roles?: string[];
  preferred_username?: string;
  email?: string;
  name?: string;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  
  if (auth.isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography>Loading authentication...</Typography>
      </Box>
    );
  }

  if (auth.error) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 400 }}>
          <Typography variant="h5" color="error" gutterBottom>
            Authentication Error
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {auth.error.message}
          </Typography>
          <Button variant="contained" onClick={() => void auth.signinRedirect()}>
            Try Again
          </Button>
        </Paper>
      </Box>
    );
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const profile = auth.user?.profile as CustomProfile | undefined;
  const roles = profile?.roles || [];
  const isAdmin = roles.includes('admin');

  if (!isAdmin) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 400 }}>
          <Typography variant="h5" color="error" gutterBottom>
            Access Denied
          </Typography>
          <Typography sx={{ mb: 1 }}>
            Hello, {profile?.preferred_username || profile?.name || 'User'}!
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Your current role: <strong>{roles.join(', ') || 'player'}</strong>
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Admin access required for this panel.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button variant="outlined" onClick={() => void auth.removeUser()}>
              Logout
            </Button>
            <Button variant="contained" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  return <>{children}</>;
}
