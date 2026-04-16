import { Alert, Box, Button, Typography } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import { useCallback, useEffect, useState } from 'react';
import { Product } from '../api';
import { mockApi } from '../api/mockApi';
import { DataTable } from '../components/DataTable';
import { EditForm } from '../components/EditForm';

const columns: GridColDef<Product>[] = [
  { field: 'id', headerName: 'ID', width: 70 },
  { field: 'name', headerName: 'Name', width: 180 },
  { field: 'price', headerName: 'Price', width: 120, valueFormatter: (value: any) => 
    typeof value === 'number' ? `$${value.toFixed(2)}` : ''  },
  { field: 'category', headerName: 'Category', width: 150 },
  { field: 'stock', headerName: 'Stock', width: 100 },
  { field: 'createdAt', headerName: 'Created', width: 180 },
];

const fields = [
  { name: 'name', label: 'Name', type: 'text' as const, required: true },
  { name: 'price', label: 'Price', type: 'number' as const, required: true },
  { name: 'category', label: 'Category', type: 'text' as const, required: true },
  { name: 'stock', label: 'Stock', type: 'number' as const },
];

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await mockApi.products.getAll();
      setProducts(response.content);
    } catch (err) {
      setError('Failed to load products');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleRowClick = (product: Product) => {
    setSelectedProduct(product);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setSelectedProduct(null);
  };

  const handleSubmit = async (data: Partial<Product>) => {
    setSaving(true);
    setError(null);
    try {
      if (selectedProduct && selectedProduct.id) {
        await mockApi.products.update(selectedProduct.id, data);
      } else {
        await mockApi.products.create(data);
      }
      await fetchProducts();
      handleClose();
    } catch (err) {
      setError('Failed to save product');
    }
    setSaving(false);
  };

  const handleAdd = () => {
    setSelectedProduct(null);
    setDialogOpen(true);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Products</Typography>
        <Button variant="contained" onClick={handleAdd}>
          Add Product
        </Button>
      </Box>
      
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <DataTable<Product>
        columns={columns}
        rows={products}
        loading={loading}
        onRowClick={handleRowClick}
      />

      <EditForm<Product>
        open={dialogOpen}
        onClose={handleClose}
        onSubmit={handleSubmit}
        initialData={selectedProduct}
        fields={fields}
        title={selectedProduct ? 'Edit Product' : 'Add Product'}
        loading={saving}
      />
    </Box>
  );
}
