import { Order, Product, User } from '../api';

const MOCK_USERS: User[] = [
  { id: 1, name: 'John Doe', email: 'john@example.com', role: User.role.ADMIN, active: true, createdAt: '2024-01-15T10:00:00Z' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: User.role.USER, active: true, createdAt: '2024-01-16T11:00:00Z' },
  { id: 3, name: 'Bob Wilson', email: 'bob@example.com', role: User.role.MANAGER, active: false, createdAt: '2024-01-17T12:00:00Z' },
  { id: 4, name: 'Alice Brown', email: 'alice@example.com', role: User.role.USER, active: true, createdAt: '2024-01-18T13:00:00Z' },
  { id: 5, name: 'Charlie Davis', email: 'charlie@example.com', role: User.role.USER, active: true, createdAt: '2024-01-19T14:00:00Z' },
  { id: 6, name: 'Diana Evans', email: 'diana@example.com', role: User.role.MANAGER, active: true, createdAt: '2024-01-20T15:00:00Z' },
  { id: 7, name: 'Edward Foster', email: 'edward@example.com', role: User.role.USER, active: false, createdAt: '2024-01-21T16:00:00Z' },
  { id: 8, name: 'Fiona Garcia', email: 'fiona@example.com', role: User.role.ADMIN, active: true, createdAt: '2024-01-22T17:00:00Z' },
];

const MOCK_PRODUCTS: Product[] = [
  { id: 1, name: 'Laptop', price: 999.99, category: 'Electronics', stock: 50, createdAt: '2024-01-10T10:00:00Z' },
  { id: 2, name: 'Mouse', price: 29.99, category: 'Electronics', stock: 200, createdAt: '2024-01-11T10:00:00Z' },
  { id: 3, name: 'Keyboard', price: 79.99, category: 'Electronics', stock: 150, createdAt: '2024-01-12T10:00:00Z' },
  { id: 4, name: 'Monitor', price: 299.99, category: 'Electronics', stock: 75, createdAt: '2024-01-13T10:00:00Z' },
  { id: 5, name: 'Desk Chair', price: 199.99, category: 'Furniture', stock: 30, createdAt: '2024-01-14T10:00:00Z' },
  { id: 6, name: 'Desk', price: 349.99, category: 'Furniture', stock: 20, createdAt: '2024-01-15T10:00:00Z' },
  { id: 7, name: 'Lamp', price: 49.99, category: 'Furniture', stock: 100, createdAt: '2024-01-16T10:00:00Z' },
  { id: 8, name: 'Headphones', price: 149.99, category: 'Electronics', stock: 80, createdAt: '2024-01-17T10:00:00Z' },
];

const MOCK_ORDERS: Order[] = [
  { id: 1, userId: 1, userName: 'John Doe', productId: 1, productName: 'Laptop', quantity: 2, status: Order.status.DELIVERED, totalPrice: 1999.98, createdAt: '2024-01-20T10:00:00Z' },
  { id: 2, userId: 2, userName: 'Jane Smith', productId: 2, productName: 'Mouse', quantity: 5, status: Order.status.SHIPPED, totalPrice: 149.95, createdAt: '2024-01-21T11:00:00Z' },
  { id: 3, userId: 3, userName: 'Bob Wilson', productId: 3, productName: 'Keyboard', quantity: 1, status: Order.status.PROCESSING, totalPrice: 79.99, createdAt: '2024-01-22T12:00:00Z' },
  { id: 4, userId: 4, userName: 'Alice Brown', productId: 5, productName: 'Desk Chair', quantity: 1, status: Order.status.PENDING, totalPrice: 199.99, createdAt: '2024-01-23T13:00:00Z' },
  { id: 5, userId: 5, userName: 'Charlie Davis', productId: 8, productName: 'Headphones', quantity: 3, status: Order.status.DELIVERED, totalPrice: 449.97, createdAt: '2024-01-24T14:00:00Z' },
  { id: 6, userId: 1, userName: 'John Doe', productId: 4, productName: 'Monitor', quantity: 1, status: Order.status.CANCELLED, totalPrice: 299.99, createdAt: '2024-01-25T15:00:00Z' },
  { id: 7, userId: 2, userName: 'Jane Smith', productId: 6, productName: 'Desk', quantity: 1, status: Order.status.SHIPPED, totalPrice: 349.99, createdAt: '2024-01-26T16:00:00Z' },
  { id: 8, userId: 3, userName: 'Bob Wilson', productId: 7, productName: 'Lamp', quantity: 2, status: Order.status.DELIVERED, totalPrice: 99.98, createdAt: '2024-01-27T17:00:00Z' },
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockApi = {
  users: {
    getAll: async (page = 0, size = 10) => {
      await delay(300);
      const start = page * size;
      const end = start + size;
      return {
        content: MOCK_USERS.slice(start, end),
        totalElements: MOCK_USERS.length,
        totalPages: Math.ceil(MOCK_USERS.length / size),
      };
    },
    getById: async (id: number) => {
      await delay(200);
      return MOCK_USERS.find(u => u.id === id) || null;
    },
    create: async (data: Partial<User>) => {
      await delay(300);
      const newUser: User = {
        id: Math.max(...MOCK_USERS.map(u => u.id!)) + 1,
        name: data.name || '',
        email: data.email || '',
        role: data.role || User.role.USER,
        active: data.active ?? true,
        createdAt: new Date().toISOString(),
      };
      MOCK_USERS.push(newUser);
      return newUser;
    },
    update: async (id: number, data: Partial<User>) => {
      await delay(300);
      const index = MOCK_USERS.findIndex(u => u.id === id);
      if (index !== -1) {
        MOCK_USERS[index] = { ...MOCK_USERS[index], ...data };
        return MOCK_USERS[index];
      }
      return null;
    },
    delete: async (id: number) => {
      await delay(300);
      const index = MOCK_USERS.findIndex(u => u.id === id);
      if (index !== -1) {
        MOCK_USERS.splice(index, 1);
      }
    },
  },

  products: {
    getAll: async (page = 0, size = 10) => {
      await delay(300);
      const start = page * size;
      const end = start + size;
      return {
        content: MOCK_PRODUCTS.slice(start, end),
        totalElements: MOCK_PRODUCTS.length,
        totalPages: Math.ceil(MOCK_PRODUCTS.length / size),
      };
    },
    getById: async (id: number) => {
      await delay(200);
      return MOCK_PRODUCTS.find(p => p.id === id) || null;
    },
    create: async (data: Partial<Product>) => {
      await delay(300);
      const newProduct: Product = {
        id: Math.max(...MOCK_PRODUCTS.map(p => p.id!)) + 1,
        name: data.name || '',
        price: data.price || 0,
        category: data.category || '',
        stock: data.stock || 0,
        createdAt: new Date().toISOString(),
      };
      MOCK_PRODUCTS.push(newProduct);
      return newProduct;
    },
    update: async (id: number, data: Partial<Product>) => {
      await delay(300);
      const index = MOCK_PRODUCTS.findIndex(p => p.id === id);
      if (index !== -1) {
        MOCK_PRODUCTS[index] = { ...MOCK_PRODUCTS[index], ...data };
        return MOCK_PRODUCTS[index];
      }
      return null;
    },
    delete: async (id: number) => {
      await delay(300);
      const index = MOCK_PRODUCTS.findIndex(p => p.id === id);
      if (index !== -1) {
        MOCK_PRODUCTS.splice(index, 1);
      }
    },
  },

  orders: {
    getAll: async (page = 0, size = 10) => {
      await delay(300);
      const start = page * size;
      const end = start + size;
      return {
        content: MOCK_ORDERS.slice(start, end),
        totalElements: MOCK_ORDERS.length,
        totalPages: Math.ceil(MOCK_ORDERS.length / size),
      };
    },
    getById: async (id: number) => {
      await delay(200);
      return MOCK_ORDERS.find(o => o.id === id) || null;
    },
    create: async (data: Partial<Order>) => {
      await delay(300);
      const user = MOCK_USERS.find(u => u.id === data.userId);
      const product = MOCK_PRODUCTS.find(p => p.id === data.productId);
      const newOrder: Order = {
        id: Math.max(...MOCK_ORDERS.map(o => o.id!)) + 1,
        userId: data.userId || 0,
        userName: user?.name || '',
        productId: data.productId || 0,
        productName: product?.name || '',
        quantity: data.quantity || 1,
        status: data.status || Order.status.PENDING,
        totalPrice: (product?.price || 0) * (data.quantity || 1),
        createdAt: new Date().toISOString(),
      };
      MOCK_ORDERS.push(newOrder);
      return newOrder;
    },
    update: async (id: number, data: Partial<Order>) => {
      await delay(300);
      const index = MOCK_ORDERS.findIndex(o => o.id === id);
      if (index !== -1) {
        const product = MOCK_PRODUCTS.find(p => p.id === MOCK_ORDERS[index].productId);
        MOCK_ORDERS[index] = { 
          ...MOCK_ORDERS[index], 
          ...data,
          totalPrice: (product?.price || 0) * (data.quantity || MOCK_ORDERS[index]?.quantity || 0),
        };
        return MOCK_ORDERS[index];
      }
      return null;
    },
    delete: async (id: number) => {
      await delay(300);
      const index = MOCK_ORDERS.findIndex(o => o.id === id);
      if (index !== -1) {
        MOCK_ORDERS.splice(index, 1);
      }
    },
  },
};
