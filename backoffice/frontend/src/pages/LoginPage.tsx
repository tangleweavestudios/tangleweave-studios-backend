import { Box, Paper, Button, Typography, Alert, CircularProgress } from '@mui/material';
import { useAuth } from 'react-oidc-context';
import { useNavigate, useLocation } from 'react-router-dom';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/users';

  if (auth.isAuthenticated) {
    navigate(from, { replace: true });
    return null;
  }

  const handleSSOLogin = () => {
    sessionStorage.setItem('oidc_return_url', from);
    void auth.signinRedirect();
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a2e',
      }}
    >
      <Paper 
        sx={{ 
          p: 5, 
          width: 420,
          textAlign: 'center',
          background: 'linear-gradient(145deg, #16213e 0%, #1a1a2e 100%)',
          color: 'white',
          borderRadius: 3,
        }}
      >
        <Typography 
          variant="h3" 
          sx={{ 
            mb: 1, 
            fontWeight: 'bold',
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          TangleWeave
        </Typography>
        <Typography variant="h5" sx={{ mb: 4, color: '#888', fontWeight: 300 }}>
          Backoffice Admin
        </Typography>
        
        {auth.error && (
          <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
            {auth.error.message}
          </Alert>
        )}
        
        <Button
          fullWidth
          variant="contained"
          size="large"
          sx={{ 
            mt: 2, 
            py: 1.5,
            fontSize: '1.1rem',
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            '&:hover': {
              background: 'linear-gradient(90deg, #5a6fd6 0%, #6a4190 100%)',
            }
          }}
          onClick={handleSSOLogin}
          disabled={auth.isLoading}
        >
          {auth.isLoading ? (
            <CircularProgress size={24} sx={{ color: 'white' }} />
          ) : (
            'Sign in with SSO'
          )}
        </Button>
        
        <Typography 
          variant="body2" 
          sx={{ mt: 4, color: '#666', fontSize: '0.85rem' }}
        >
          Authentication powered by Rauthy
        </Typography>
        
        <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid #333' }}>
          <Typography variant="caption" sx={{ color: '#555' }}>
            Default admin: admin@localhost.de
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
