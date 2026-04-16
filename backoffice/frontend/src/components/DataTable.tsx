import { Box, CircularProgress } from '@mui/material';
import { DataGrid, GridColDef, GridRowParams, GridValidRowModel } from '@mui/x-data-grid';

interface DataTableProps<T extends GridValidRowModel> {
  columns: GridColDef<T>[];
  rows: T[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends GridValidRowModel>({ columns, rows, loading, onRowClick }: DataTableProps<T>) {
  return (
    <Box sx={{ height: 600, width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        loading={loading}
        initialState={{
          pagination: {
            paginationModel: { pageSize: 10 },
          },
        }}
        pageSizeOptions={[5, 10, 25, 50]}
        onRowClick={(params: GridRowParams<T>) => onRowClick?.(params.row)}
        sx={{
          cursor: onRowClick ? 'pointer' : 'default',
          '& .MuiDataGrid-row:hover': onRowClick ? {
            backgroundColor: 'action.hover',
          } : undefined,
        }}
        slots={{
          loadingOverlay: CircularProgress,
        }}
      />
    </Box>
  );
}
