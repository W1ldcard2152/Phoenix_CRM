// src/client/src/App.jsx - Fixed with Appointment Routes

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './components/wizard/wizard.css';
import './styles/mobile.css';
import './utils/pwaUtils';

// Layout components
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';

// Pages
import Dashboard from './pages/Dashboard/Dashboard';
import CustomerList from './pages/Customers/CustomerList';
import CustomerDetail from './pages/Customers/CustomerDetail';
import CustomerForm from './pages/Customers/CustomerForm';
import VehicleList from './pages/Vehicles/VehicleList';
import VehicleDetail from './pages/Vehicles/VehicleDetail';
import VehicleForm from './pages/Vehicles/VehicleForm';
import WorkOrderList from './pages/WorkOrders/WorkOrderList';
import WorkOrderDetail from './pages/WorkOrders/WorkOrderDetail';
import WorkOrderForm from './pages/WorkOrders/WorkOrderForm';
import AppointmentList from './pages/Appointments/AppointmentList';
import AppointmentDetail from './pages/Appointments/AppointmentDetail';
import AppointmentForm from './pages/Appointments/AppointmentForm';
import InvoiceGenerator from './pages/Invoices/InvoiceGenerator';
import InvoiceDetail from './pages/Invoices/InvoiceDetail'; // Added InvoiceDetail
import InvoiceList from './pages/Invoices/InvoiceList';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';


// New Pages for Sidebar
import TechniciansPage from './pages/Technicians/TechniciansPage';
import AdminPage from './pages/Admin/AdminPage';
import SettingsPage from './pages/Settings/SettingsPage';
import FeedbackAdminPage from './pages/Feedback/FeedbackAdminPage'; // Import new FeedbackAdminPage

// Parts Pages
import PartsList from './pages/Parts/PartsList';
import PartsForm from './pages/Parts/PartsForm';

// Auth Context
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Private Route Component
const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* App Routes with Layout */}
          <Route path="/*" element={
            <PrivateRoute>
              <div className="flex h-screen bg-gray-100">
                {/* Mobile: Sidebar overlay, Desktop: Fixed sidebar */}
                <Sidebar />
                <div className="flex flex-col flex-1 overflow-hidden min-w-0">
                  <Navbar />
                  <main className="flex-1 overflow-y-auto p-2 sm:p-4">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      
                      {/* Customer Routes */}
                      <Route path="/customers" element={<CustomerList />} />
                      <Route path="/customers/new" element={<CustomerForm />} />
                      <Route path="/customers/:id" element={<CustomerDetail />} />
                      <Route path="/customers/:id/edit" element={<CustomerForm />} />
                      
                      {/* Vehicle Routes */}
                      <Route path="/vehicles" element={<VehicleList />} />
                      <Route path="/vehicles/new" element={<VehicleForm />} />
                      <Route path="/vehicles/:id" element={<VehicleDetail />} />
                      <Route path="/vehicles/:id/edit" element={<VehicleForm />} />
                      
                      {/* Work Order Routes */}
                      <Route path="/work-orders" element={<WorkOrderList />} />
                      <Route path="/work-orders/new" element={<WorkOrderForm />} />
                      <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
                      <Route path="/work-orders/:id/edit" element={<WorkOrderForm />} />
                      
                      {/* Appointment Routes */}
                      <Route path="/appointments" element={<AppointmentList />} />
                      <Route path="/appointments/new" element={<AppointmentForm />} />
                      <Route path="/appointments/:id" element={<AppointmentDetail />} />
                      <Route path="/appointments/:id/edit" element={<AppointmentForm />} />
                      
                      {/* Invoice Routes */}
                      <Route path="/invoices" element={<InvoiceList />} />
                      <Route path="/invoices/new" element={<InvoiceGenerator />} />
                      <Route path="/invoices/new/:id" element={<InvoiceGenerator />} />
                      <Route path="/invoices/generate" element={<InvoiceGenerator />} />
                      <Route path="/invoices/:id" element={<InvoiceDetail />} /> {/* Added InvoiceDetail Route */}

                      {/* Technician Routes */}
                      <Route path="/technicians" element={<TechniciansPage />} />
                      
                      {/* Admin Routes */}
                      <Route path="/admin" element={<AdminPage />} />

                      {/* Feedback Admin Route */}
                      <Route path="/feedback" element={<FeedbackAdminPage />} />

                      {/* Parts Routes */}
                      <Route path="/parts" element={<PartsList />} />
                      <Route path="/parts/new" element={<PartsForm />} />
                      <Route path="/parts/:id/edit" element={<PartsForm />} />

                      {/* Settings Routes */}
                      <Route path="/settings" element={<SettingsPage />} />
                      
                      {/* Fallback - Redirect to Dashboard */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </main>
                </div>
              </div>
            </PrivateRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
