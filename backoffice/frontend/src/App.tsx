import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { CallbackPage } from './pages/CallbackPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProductsPage } from './pages/ProductsPage';
import { UsersPage } from './pages/UsersPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { ApiProvider } from './providers/ApiProvider';

function App() {
  return (
    <ApiProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/callback" element={<CallbackPage />} />
        
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/users" replace />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="orders" element={<OrdersPage />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/users" replace />} />
      </Routes>
    </ApiProvider>
  );
}

export default App;
