import { Alert, Box, Button, Typography } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import { useCallback, useEffect, useState } from 'react';
import { User } from '../api';
import { mockApi } from '../api/mockApi';
import { DataTable } from '../components/DataTable';
import { EditForm } from '../components/EditForm';

const columns: GridColDef<User>[] = [
  { field: 'id', headerName: 'ID', width: 70 },
  { field: 'name', headerName: 'Name', width: 180 },
  { field: 'email', headerName: 'Email', width: 220 },
  { field: 'role', headerName: 'Role', width: 120 },
  { 
    field: 'active', 
    headerName: 'Active', 
    width: 100,
    valueFormatter: (value: any) => value ? 'Yes' : 'No',
  },
  { field: 'createdAt', headerName: 'Created', width: 180 },
];

const fields = [
  { name: 'name', label: 'Name', type: 'text' as const, required: true },
  { name: 'email', label: 'Email', type: 'email' as const, required: true },
  { 
    name: 'role', 
    label: 'Role', 
    type: 'select' as const, 
    options: [
      { value: 'admin', label: 'Admin' },
      { value: 'user', label: 'User' },
      { value: 'manager', label: 'Manager' },
    ],
    required: true,
  },
  { name: 'active', label: 'Active', type: 'boolean' as const },
];

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await mockApi.users.getAll();
      setUsers(response.content);
    } catch (err) {
      setError('Failed to load users');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRowClick = (user: User) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setSelectedUser(null);
  };

  const handleSubmit = async (data: Partial<User>) => {
    setSaving(true);
    setError(null);
    try {
      if (selectedUser && selectedUser.id) {
        await mockApi.users.update(selectedUser.id, data);
      } else {
        await mockApi.users.create(data);
      }
      await fetchUsers();
      handleClose();
    } catch (err) {
      setError('Failed to save user');
    }
    setSaving(false);
  };

  const handleAdd = () => {
    setSelectedUser(null);
    setDialogOpen(true);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Users</Typography>
        <Button variant="contained" onClick={handleAdd}>
          Add User
        </Button>
      </Box>
      
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <DataTable<User>
        columns={columns}
        rows={users}
        loading={loading}
        onRowClick={handleRowClick}
      />

      <EditForm<User>
        open={dialogOpen}
        onClose={handleClose}
        onSubmit={handleSubmit}
        initialData={selectedUser}
        fields={fields}
        title={selectedUser ? 'Edit User' : 'Add User'}
        loading={saving}
      />
    </Box>
  );
}
