import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';

const AdminPage = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Administration</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* User Management */}
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">User Management</h3>
            <p className="text-sm text-gray-600 mb-4">
              Manage user accounts, roles, and permissions
            </p>
            <Button variant="outline" size="sm" disabled>
              Coming Soon
            </Button>
          </div>
        </Card>

        {/* System Settings */}
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">System Settings</h3>
            <p className="text-sm text-gray-600 mb-4">
              Configure tax rates, business information, and system preferences
            </p>
            <Button variant="outline" size="sm" disabled>
              Coming Soon
            </Button>
          </div>
        </Card>

        {/* Reports & Analytics */}
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Reports & Analytics</h3>
            <p className="text-sm text-gray-600 mb-4">
              Generate business reports and view analytics dashboard
            </p>
            <Button variant="outline" size="sm" disabled>
              Coming Soon
            </Button>
          </div>
        </Card>

        {/* Data Management */}
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Data Management</h3>
            <p className="text-sm text-gray-600 mb-4">
              Backup, restore, and manage system data
            </p>
            <Button variant="outline" size="sm" disabled>
              Coming Soon
            </Button>
          </div>
        </Card>

        {/* Invoice Management */}
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Invoice Management</h3>
            <p className="text-sm text-gray-600 mb-4">
              Manage all invoices, payment status, and billing
            </p>
            <Link to="/invoices">
              <Button variant="primary" size="sm">
                View Invoices
              </Button>
            </Link>
          </div>
        </Card>

        {/* System Logs */}
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">System Logs</h3>
            <p className="text-sm text-gray-600 mb-4">
              View system activity logs and error reports
            </p>
            <Button variant="outline" size="sm" disabled>
              Coming Soon
            </Button>
          </div>
        </Card>
      </div>

      <Card className="mt-8">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-4">
            <Link to="/invoices/generate">
              <Button variant="outline" size="sm">
                Create Manual Invoice
              </Button>
            </Link>
            <Button variant="outline" size="sm" disabled>
              System Backup
            </Button>
            <Button variant="outline" size="sm" disabled>
              View Error Logs
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AdminPage;