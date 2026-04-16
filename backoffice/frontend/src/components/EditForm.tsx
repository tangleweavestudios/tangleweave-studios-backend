import { useState, useEffect, ReactNode } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Box,
} from '@mui/material';

export interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'select' | 'boolean';
  options?: { value: string; label: string }[];
  required?: boolean;
}

interface EditFormProps<T> {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: T) => void;
  initialData: T | null;
  fields: FieldConfig[];
  title: string;
  loading?: boolean;
}

export function EditForm<T extends Record<string, unknown>>({
  open,
  onClose,
  onSubmit,
  initialData,
  fields,
  title,
  loading,
}: EditFormProps<T>) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData });
    } else {
      const defaults: Record<string, unknown> = {};
      fields.forEach(field => {
        defaults[field.name] = field.type === 'boolean' ? false : '';
      });
      setFormData(defaults);
    }
  }, [initialData, fields]);

  const handleChange = (name: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    onSubmit(formData as T);
  };

  const renderField = (field: FieldConfig): ReactNode => {
    const value = formData[field.name];

    switch (field.type) {
      case 'boolean':
        return (
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(value)}
                onChange={e => handleChange(field.name, e.target.checked)}
              />
            }
            label={field.label}
          />
        );
      case 'select':
        return (
          <FormControl fullWidth>
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={(value as string) || ''}
              label={field.label}
              onChange={e => handleChange(field.name, e.target.value)}
            >
              {field.options?.map(option => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      case 'number':
        return (
          <TextField
            fullWidth
            label={field.label}
            type="number"
            value={value ?? ''}
            onChange={e => handleChange(field.name, Number(e.target.value))}
            required={field.required}
          />
        );
      case 'email':
        return (
          <TextField
            fullWidth
            label={field.label}
            type="email"
            value={value ?? ''}
            onChange={e => handleChange(field.name, e.target.value)}
            required={field.required}
          />
        );
      default:
        return (
          <TextField
            fullWidth
            label={field.label}
            value={value ?? ''}
            onChange={e => handleChange(field.name, e.target.value)}
            required={field.required}
          />
        );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {fields.map(field => (
            <Box key={field.name}>{renderField(field)}</Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
