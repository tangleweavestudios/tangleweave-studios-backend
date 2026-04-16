import { Alert, Box, Button, Typography } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import { useCallback, useEffect, useState } from 'react';
import { Order, Product, User } from '../api';
import { mockApi } from '../api/mockApi';
import { DataTable } from '../components/DataTable';
import { EditForm, FieldConfig } from '../components/EditForm';

const columns: GridColDef<Order>[] = [
  { field: 'id', headerName: 'ID', width: 70 },
  { field: 'userName', headerName: 'Customer', width: 150 },
  { field: 'productName', headerName: 'Product', width: 150 },
  { field: 'quantity', headerName: 'Qty', width: 80 },
  { 
    field: 'status', 
    headerName: 'Status', 
    width: 130,
    valueFormatter: (value) => value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : '',
  },
  { 
    field: 'totalPrice', 
    headerName: 'Total', 
    width: 120, 
    valueFormatter: (value: any) => 
    typeof value === 'number' ? `$${value.toFixed(2)}` : '' 
  },
  { field: 'createdAt', headerName: 'Created', width: 180 },
];

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, usersRes, productsRes] = await Promise.all([
        mockApi.orders.getAll(),
        mockApi.users.getAll(),
        mockApi.products.getAll(),
      ]);
      setOrders(ordersRes.content);
      setUsers(usersRes.content);
      setProducts(productsRes.content);
    } catch (err) {
      setError('Failed to load orders');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const fields: FieldConfig[] = [
    { 
      name: 'userId', 
      label: 'Customer', 
      type: 'select' as const, 
      required: true,
      options: users.map(u => ({ value: String(u.id), label: u.name || '' })),
    },
    { 
      name: 'productId', 
      label: 'Product', 
      type: 'select' as const, 
      required: true,
      options: products.map(p => ({ value: String(p.id), label: p.name || '' })),
    },
    { name: 'quantity', label: 'Quantity', type: 'number' as const, required: true },
    { 
      name: 'status', 
      label: 'Status', 
      type: 'select' as const, 
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'processing', label: 'Processing' },
        { value: 'shipped', label: 'Shipped' },
        { value: 'delivered', label: 'Delivered' },
        { value: 'cancelled', label: 'Cancelled' },
      ],
      required: true,
    },
  ];

  const handleRowClick = (order: Order) => {
    setSelectedOrder(order);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleSubmit = async (data: Partial<Order>) => {
    setSaving(true);
    setError(null);
    try {
      if (selectedOrder && selectedOrder.id) {
        await mockApi.orders.update(selectedOrder.id, data);
      } else {
        await mockApi.orders.create(data);
      }
      await fetchOrders();
      handleClose();
    } catch {
      setError('Failed to save order');
    }
    setSaving(false);
  };

  const handleAdd = () => {
    setSelectedOrder(null);
    setDialogOpen(true);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Orders</Typography>
        <Button variant="contained" onClick={handleAdd}>
          Add Order
        </Button>
      </Box>
      
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <DataTable<Order>
        columns={columns}
        rows={orders}
        loading={loading}
        onRowClick={handleRowClick}
      />

      <EditForm<Order>
        open={dialogOpen}
        onClose={handleClose}
        onSubmit={handleSubmit}
        initialData={selectedOrder}
        fields={fields}
        title={selectedOrder ? 'Edit Order' : 'Add Order'}
        loading={saving}
      />
    </Box>
  );
}
