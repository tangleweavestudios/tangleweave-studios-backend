import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Box, CircularProgress, Typography } from '@mui/material';

export function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated) {
      const returnUrl = sessionStorage.getItem('oidc_return_url') || '/users';
      sessionStorage.removeItem('oidc_return_url');
      navigate(returnUrl, { replace: true });
    } else if (!auth.isLoading && !auth.isAuthenticated && auth.error) {
      console.error('Callback error:', auth.error);
      navigate('/login', { replace: true });
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.error, navigate]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        backgroundColor: '#1a1a2e',
        color: 'white',
      }}
    >
      <CircularProgress sx={{ color: '#667eea' }} />
      <Typography>Completing authentication...</Typography>
    </Box>
  );
}
