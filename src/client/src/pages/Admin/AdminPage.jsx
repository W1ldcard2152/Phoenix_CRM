import React, { useState, useEffect, useCallback } from 'react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import SelectInput from '../../components/common/SelectInput';
import Modal from '../../components/common/Modal';
import API from '../../services/api';

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'management', label: 'Management' },
  { value: 'service-writer', label: 'Service Writer' },
  { value: 'technician', label: 'Technician' }
];

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'disabled', label: 'Disabled' }
];

const AdminPage = () => {
  const [users, setUsers] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('technician');
  const [inviteTechnician, setInviteTechnician] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);

  // Edit modal state
  const [editUser, setEditUser] = useState(null);
  const [editRole, setEditRole] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editTechnician, setEditTechnician] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes, techsRes] = await Promise.all([
        API.get('/admin/users'),
        API.get('/technicians')
      ]);
      setUsers(usersRes.data.data.users);
      setTechnicians(techsRes.data.data.technicians || techsRes.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load users. Make sure you have admin privileges.');
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      await API.post('/admin/users', {
        email: inviteEmail,
        role: inviteRole,
        technician: inviteTechnician || undefined
      });
      setInviteSuccess(`User ${inviteEmail} has been pre-authorized.`);
      setInviteEmail('');
      setInviteRole('technician');
      setInviteTechnician('');
      fetchData();
    } catch (err) {
      setInviteError(err.response?.data?.message || 'Failed to invite user.');
    } finally {
      setInviteLoading(false);
    }
  };

  const openEditModal = (user) => {
    setEditUser(user);
    setEditRole(user.role);
    setEditStatus(user.status || 'active');
    setEditTechnician(user.technician?._id || user.technician || '');
  };

  const handleEditSave = async () => {
    setEditLoading(true);
    try {
      await API.patch(`/admin/users/${editUser._id}`, {
        role: editRole,
        status: editStatus,
        technician: editTechnician || null
      });
      setEditUser(null);
      fetchData();
    } catch (err) {
      console.error('Error updating user:', err);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeactivate = async (userId) => {
    if (!window.confirm('Are you sure you want to deactivate this user?')) return;
    try {
      await API.delete(`/admin/users/${userId}`);
      fetchData();
    } catch (err) {
      console.error('Error deactivating user:', err);
    }
  };

  const handleReactivate = async (userId) => {
    try {
      await API.patch(`/admin/users/${userId}`, {
        active: true,
        status: 'active'
      });
      fetchData();
    } catch (err) {
      console.error('Error reactivating user:', err);
    }
  };

  const technicianOptions = [
    { value: '', label: 'None' },
    ...technicians.map(t => ({ value: t._id, label: t.name }))
  ];

  const getStatusBadge = (user) => {
    if (user.active === false) {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">Inactive</span>;
    }
    const colors = {
      active: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      disabled: 'bg-red-100 text-red-700'
    };
    const status = user.status || 'active';
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || colors.active}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getRoleBadge = (role) => {
    const colors = {
      admin: 'bg-purple-100 text-purple-700',
      management: 'bg-teal-100 text-teal-700',
      'service-writer': 'bg-indigo-100 text-indigo-700',
      technician: 'bg-blue-100 text-blue-700'
    };
    const labels = {
      admin: 'Admin',
      management: 'Management',
      'service-writer': 'Service Writer',
      technician: 'Technician'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[role] || 'bg-gray-100 text-gray-700'}`}>
        {labels[role] || role}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center">
        <div className="text-gray-500">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">User Management</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Invite User Form */}
      <Card title="Invite New User">
        <form onSubmit={handleInvite} className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Email Address"
              name="inviteEmail"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              placeholder="user@example.com"
            />
            <SelectInput
              label="Role"
              name="inviteRole"
              options={roleOptions}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            />
            <SelectInput
              label="Link to Technician"
              name="inviteTechnician"
              options={technicianOptions}
              value={inviteTechnician}
              onChange={(e) => setInviteTechnician(e.target.value)}
            />
          </div>

          {inviteError && (
            <div className="text-red-600 text-sm">{inviteError}</div>
          )}
          {inviteSuccess && (
            <div className="text-green-600 text-sm">{inviteSuccess}</div>
          )}

          <Button type="submit" variant="primary" size="sm" disabled={inviteLoading || !inviteEmail}>
            {inviteLoading ? 'Inviting...' : 'Invite User'}
          </Button>
        </form>
      </Card>

      {/* Users Table */}
      <Card title={`All Users (${users.length})`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Technician</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auth</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user._id} className={user.active === false ? 'bg-gray-50 opacity-60' : ''}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center">
                      {user.avatar ? (
                        <img src={user.avatar} alt="" className="h-8 w-8 rounded-full mr-3" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-primary-500 text-white flex items-center justify-center mr-3 text-sm font-medium">
                          {user.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{getRoleBadge(user.role)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{getStatusBadge(user)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {user.technician?.name || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {user.googleId ? (
                      <span className="inline-flex items-center">
                        <i className="fab fa-google text-red-500 mr-1"></i> Google
                      </span>
                    ) : (
                      <span className="inline-flex items-center">
                        <i className="fas fa-key text-gray-400 mr-1"></i> Password
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm space-x-2">
                    <button
                      onClick={() => openEditModal(user)}
                      className="text-primary-600 hover:text-primary-800 font-medium"
                    >
                      Edit
                    </button>
                    {user.active === false ? (
                      <button
                        onClick={() => handleReactivate(user._id)}
                        className="text-green-600 hover:text-green-800 font-medium"
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDeactivate(user._id)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit User Modal */}
      {editUser && (
        <Modal
          isOpen={!!editUser}
          onClose={() => setEditUser(null)}
          title={`Edit User: ${editUser.name}`}
          size="md"
          actions={[
            { label: 'Cancel', onClick: () => setEditUser(null), variant: 'outline' },
            { label: editLoading ? 'Saving...' : 'Save Changes', onClick: handleEditSave, variant: 'primary' }
          ]}
        >
          <div className="space-y-4">
            <div className="text-sm text-gray-500 mb-4">
              {editUser.email}
            </div>
            <SelectInput
              label="Role"
              name="editRole"
              options={roleOptions}
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
            />
            <SelectInput
              label="Status"
              name="editStatus"
              options={statusOptions}
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
            />
            <SelectInput
              label="Linked Technician"
              name="editTechnician"
              options={technicianOptions}
              value={editTechnician}
              onChange={(e) => setEditTechnician(e.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminPage;
