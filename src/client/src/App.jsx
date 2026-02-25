// src/client/src/App.jsx - Fixed with Appointment Routes

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
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
import QuoteList from './pages/Quotes/QuoteList';
import DocumentDetail from './pages/Documents/DocumentDetail';
import DocumentForm from './pages/Documents/DocumentForm';
import AppointmentList from './pages/Appointments/AppointmentList';
import AppointmentDetail from './pages/Appointments/AppointmentDetail';
import AppointmentForm from './pages/Appointments/AppointmentForm';
import InvoiceGenerator from './pages/Invoices/InvoiceGenerator';
import InvoiceDetail from './pages/Invoices/InvoiceDetail'; // Added InvoiceDetail
import InvoiceList from './pages/Invoices/InvoiceList';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import OAuthCallback from './pages/Auth/OAuthCallback';


// New Pages for Sidebar
import TechniciansPage from './pages/Technicians/TechniciansPage';
import AdminPage from './pages/Admin/AdminPage';
import SettingsPage from './pages/Settings/SettingsPage';
import FeedbackAdminPage from './pages/Feedback/FeedbackAdminPage'; // Import new FeedbackAdminPage
import IntakePage from './pages/Intake/IntakePage';

// Parts Pages
import PartsList from './pages/Parts/PartsList';
import PartsForm from './pages/Parts/PartsForm';

// Technician Portal Pages
import TechnicianPortal from './pages/TechnicianPortal/TechnicianPortal';
import TechnicianChecklist from './pages/TechnicianPortal/TechnicianChecklist';
import TechnicianWorkOrderDetail from './pages/TechnicianPortal/TechnicianWorkOrderDetail';

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

// Role-restricted Route Component
const RoleRoute = ({ children, roles }) => {
  const { user } = useAuth();
  if (!user || (roles && !roles.includes(user.role))) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />
          
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
                      <Route path="/intake" element={<IntakePage />} />
                      
                      {/* Customer Routes (office staff) */}
                      <Route path="/customers" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><CustomerList /></RoleRoute>} />
                      <Route path="/customers/new" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><CustomerForm /></RoleRoute>} />
                      <Route path="/customers/:id" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><CustomerDetail /></RoleRoute>} />
                      <Route path="/customers/:id/edit" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><CustomerForm /></RoleRoute>} />
                      
                      {/* Vehicle Routes (office staff) */}
                      <Route path="/vehicles" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><VehicleList /></RoleRoute>} />
                      <Route path="/vehicles/new" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><VehicleForm /></RoleRoute>} />
                      <Route path="/vehicles/:id" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><VehicleDetail /></RoleRoute>} />
                      <Route path="/vehicles/:id/edit" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><VehicleForm /></RoleRoute>} />
                      
                      {/* Work Order Routes */}
                      <Route path="/work-orders" element={<WorkOrderList />} />
                      <Route path="/work-orders/new" element={<DocumentForm mode="workorder" />} />
                      <Route path="/work-orders/:id" element={<DocumentDetail />} />
                      <Route path="/work-orders/:id/edit" element={<DocumentForm mode="workorder" />} />

                      {/* Quote Routes (office staff) */}
                      <Route path="/quotes" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><QuoteList /></RoleRoute>} />
                      <Route path="/quotes/new" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><DocumentForm mode="quote" /></RoleRoute>} />
                      <Route path="/quotes/:id" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><DocumentDetail /></RoleRoute>} />
                      <Route path="/quotes/:id/edit" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><DocumentForm mode="quote" /></RoleRoute>} />
                      
                      {/* Appointment Routes (office staff) */}
                      <Route path="/appointments" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><AppointmentList /></RoleRoute>} />
                      <Route path="/appointments/new" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><AppointmentForm /></RoleRoute>} />
                      <Route path="/appointments/:id" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><AppointmentDetail /></RoleRoute>} />
                      <Route path="/appointments/:id/edit" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><AppointmentForm /></RoleRoute>} />
                      
                      {/* Invoice Routes (office staff) */}
                      <Route path="/invoices" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><InvoiceList /></RoleRoute>} />
                      <Route path="/invoices/new" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><InvoiceGenerator /></RoleRoute>} />
                      <Route path="/invoices/new/:id" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><InvoiceGenerator /></RoleRoute>} />
                      <Route path="/invoices/generate" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><InvoiceGenerator /></RoleRoute>} />
                      <Route path="/invoices/:id" element={<RoleRoute roles={['admin', 'management', 'service-writer']}><InvoiceDetail /></RoleRoute>} />

                      {/* Technician Routes */}
                      <Route path="/technicians" element={<TechniciansPage />} />
                      
                      {/* Admin Routes */}
                      <Route path="/admin" element={<RoleRoute roles={['admin', 'management']}><AdminPage /></RoleRoute>} />

                      {/* Feedback Admin Route (admin only) */}
                      <Route path="/feedback" element={<RoleRoute roles={['admin']}><FeedbackAdminPage /></RoleRoute>} />

                      {/* Parts Routes (list open to all, create/edit admin+management) */}
                      <Route path="/parts" element={<PartsList />} />
                      <Route path="/parts/new" element={<RoleRoute roles={['admin', 'management']}><PartsForm /></RoleRoute>} />
                      <Route path="/parts/:id/edit" element={<RoleRoute roles={['admin', 'management']}><PartsForm /></RoleRoute>} />

                      {/* Technician Portal Routes */}
                      <Route path="/technician-portal" element={<TechnicianPortal />} />
                      <Route path="/technician-portal/checklist/:id" element={<TechnicianChecklist />} />
                      <Route path="/technician-portal/work-orders/:id" element={<TechnicianWorkOrderDetail />} />

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
