import { Inventory, Logout, People, ShoppingCart, AdminPanelSettings } from '@mui/icons-material';
import { AppBar, Box, Button, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, Chip } from '@mui/material';
import { ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

const drawerWidth = 240;

interface LayoutProps {
  children?: ReactNode;
}

interface CustomProfile {
  roles?: string[];
  preferred_username?: string;
  email?: string;
  name?: string;
}

const menuItems = [
  { text: 'Users', icon: <People />, path: '/users' },
  { text: 'Products', icon: <Inventory />, path: '/products' },
  { text: 'Orders', icon: <ShoppingCart />, path: '/orders' },
];

export function Layout({}: LayoutProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const profile = auth.user?.profile as CustomProfile | undefined;
  const displayName = profile?.preferred_username || profile?.name || profile?.email || 'User';
  const roles = profile?.roles || [];

  const handleLogout = () => {
    void auth.removeUser();
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: theme => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <AdminPanelSettings sx={{ mr: 2 }} />
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            TangleWeave Admin
          </Typography>
          <Chip 
            label={roles.includes('admin') ? 'Admin' : roles[0] || 'User'} 
            size="small" 
            sx={{ mr: 2, backgroundColor: roles.includes('admin') ? '#667eea' : '#666' }} 
          />
          <Typography variant="body2" sx={{ mr: 2 }}>
            {displayName}
          </Typography>
          <Button 
            color="inherit" 
            onClick={handleLogout} 
            startIcon={<Logout />}
            variant="outlined"
            size="small"
            sx={{ borderColor: 'rgba(255,255,255,0.3)' }}
          >
            Logout
          </Button>
        </Toolbar>
      </AppBar>
      
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.map(item => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
      
      <Box component="main" sx={{ flexGrow: 1, p: 3, backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
