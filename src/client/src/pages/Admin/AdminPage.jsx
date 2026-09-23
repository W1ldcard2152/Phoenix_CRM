import React, { useState, useEffect, useCallback } from 'react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import SelectInput from '../../components/common/SelectInput';
import Modal from '../../components/common/Modal';
import API from '../../services/api';
import settingsService from '../../services/settingsService';
import { formatDate } from '../../utils/formatters';

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
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Password link modal state
  const [passwordLink, setPasswordLink] = useState(null); // { user, url, expiresAt, error }
  const [linkCopied, setLinkCopied] = useState(false);

  // Settings state
  const [showServiceAdvisorOnInvoice, setShowServiceAdvisorOnInvoice] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes, techsRes, settingsRes] = await Promise.all([
        API.get('/admin/users'),
        API.get('/technicians'),
        settingsService.getSettings()
      ]);
      setUsers(usersRes.data.data.users);
      setTechnicians(techsRes.data.data.technicians || techsRes.data.data || []);
      setShowServiceAdvisorOnInvoice(settingsRes.data?.settings?.showServiceAdvisorOnInvoice || false);
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
      setInviteSuccess(
        `${inviteEmail} can now sign in with Google. To use a password instead, give them a Password link from the list below.`
      );
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

  // One-time link to set a password: for a forgotten password (this shop may
  // not send email) or a newly invited user who won't use Google. The admin
  // hands it over — text it, or open it on the person's own device.
  const handlePasswordLink = async (user) => {
    setLinkCopied(false);
    setPasswordLink({ user, url: null, expiresAt: null, error: null });
    try {
      const res = await API.post(`/admin/users/${user._id}/password-link`);
      setPasswordLink({ user, ...res.data.data, error: null });
    } catch (err) {
      setPasswordLink({ user, url: null, expiresAt: null, error: err.response?.data?.message || 'Could not create a link.' });
    }
  };

  const copyPasswordLink = async () => {
    try {
      await navigator.clipboard.writeText(passwordLink.url);
      setLinkCopied(true);
    } catch {
      // Clipboard blocked (http, or permissions) — the field is selectable instead.
    }
  };

  const openEditModal = (user) => {
    setEditUser(user);
    setEditRole(user.role);
    setEditStatus(user.status || 'active');
    setEditTechnician(user.technician?._id || user.technician || '');
    setEditDisplayName(user.displayName || '');
  };

  const handleEditSave = async () => {
    setEditLoading(true);
    try {
      await API.patch(`/admin/users/${editUser._id}`, {
        role: editRole,
        status: editStatus,
        technician: editTechnician || null,
        displayName: editDisplayName || null
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

  const handleToggleServiceAdvisor = async () => {
    setSettingsLoading(true);
    try {
      const newValue = !showServiceAdvisorOnInvoice;
      await settingsService.updateSettings({ showServiceAdvisorOnInvoice: newValue });
      setShowServiceAdvisorOnInvoice(newValue);
    } catch (err) {
      console.error('Error updating settings:', err);
    } finally {
      setSettingsLoading(false);
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

      {/* Invoice Settings */}
      <Card title="Invoice Settings">
        <div className="p-4">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showServiceAdvisorOnInvoice}
              onChange={handleToggleServiceAdvisor}
              disabled={settingsLoading}
              className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">
              Show Service Advisor name on invoices
            </span>
          </label>
          <p className="mt-1 ml-7 text-xs text-gray-500">
            When enabled, the service writer who created the work order will appear on printed/downloaded invoices (first name or display name only).
          </p>
        </div>
      </Card>

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
                        <div className="text-sm font-medium text-gray-900">
                          {user.name}
                          {user.displayName && (
                            <span className="ml-1 text-xs text-gray-400">({user.displayName})</span>
                          )}
                        </div>
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
                    {user.createdAt ? formatDate(user.createdAt) : '—'}
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
                      <>
                        <button
                          onClick={() => handlePasswordLink(user)}
                          className="text-primary-600 hover:text-primary-800 font-medium"
                        >
                          Password link
                        </button>
                        <button
                          onClick={() => handleDeactivate(user._id)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Deactivate
                        </button>
                      </>
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
            <div>
              <Input
                label="Display Name"
                name="editDisplayName"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Nickname for customer-facing docs"
              />
              <p className="-mt-3 mb-4 text-xs text-gray-500">
                Used on invoices and printed documents instead of full name. Leave blank to use first name.
              </p>
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

      {/* Password Link Modal */}
      {passwordLink && (
        <Modal
          isOpen={!!passwordLink}
          onClose={() => setPasswordLink(null)}
          title={`Password link: ${passwordLink.user.name}`}
          size="md"
          actions={[
            { label: 'Done', onClick: () => setPasswordLink(null), variant: 'primary' }
          ]}
        >
          {passwordLink.error ? (
            <div className="text-red-600 text-sm">{passwordLink.error}</div>
          ) : !passwordLink.url ? (
            <div className="text-sm text-gray-500">Creating link…</div>
          ) : (
            <div className="space-y-4 text-sm text-gray-700">
              <p>
                Send this to <strong>{passwordLink.user.email}</strong> — a text message is fine.
                Opening it lets them choose a new password and signs them in.
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={passwordLink.url}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                />
                <Button size="sm" variant="outline" onClick={copyPasswordLink}>
                  {linkCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-gray-500">
                Works once, until {formatDate(passwordLink.expiresAt, 'MMM D, h:mm A')}. Their current
                password keeps working until they use it. Anyone holding the link can set this
                account's password, so send it only to them.
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

export default AdminPage;
