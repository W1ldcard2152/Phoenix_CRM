import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import AuthService from '../../services/authService';
import SettingsService from '../../services/settingsService';
import { formatDate } from '../../utils/formatters';
import { VEHICLE_MAKES } from '../../utils/vehicleMakes';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun display order

const HOUR_OPTIONS = (() => {
  const opts = [];
  for (let h = 6; h <= 22; h++) {
    const hh = String(h).padStart(2, '0');
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const period = h >= 12 ? 'PM' : 'AM';
    opts.push({ value: `${hh}:00`, label: `${displayH}:00 ${period}` });
  }
  return opts;
})();

const LUNCH_DURATION_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hr' },
];

const DEFAULT_SHOP_HOURS = [
  { dayOfWeek: 0, open: '08:00', close: '18:00', closed: true,  lunchStart: '', lunchDuration: 0 },
  { dayOfWeek: 1, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
  { dayOfWeek: 2, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
  { dayOfWeek: 3, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
  { dayOfWeek: 4, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
  { dayOfWeek: 5, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
  { dayOfWeek: 6, open: '08:00', close: '18:00', closed: true,  lunchStart: '', lunchDuration: 0 },
];

const SettingsPage = () => {
  const navigate = useNavigate();
  const { currentUser, updateUser, updateToken } = useAuth();
  const { refreshCompany } = useCompany();

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'management';

  const [activeTab, setActiveTab] = useState('profile');

  // User Info State
  const [userInfo, setUserInfo] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || ''
  });
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState({ type: '', text: '' });
  const [isUpdatingInfo, setIsUpdatingInfo] = useState(false);

  // Password State
  const [passwordData, setPasswordData] = useState({
    passwordCurrent: '',
    password: '',
    passwordConfirm: ''
  });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  // Shop Settings State (admin/management only)
  const [shopSettings, setShopSettings] = useState({ partMarkupPercentage: 30, defaultLaborRate: 75, taxRate: 8 });
  const [shopSettingsMessage, setShopSettingsMessage] = useState({ type: '', text: '' });
  const [isUpdatingShopSettings, setIsUpdatingShopSettings] = useState(false);

  // Company Profile State (admin/management only) — prints on invoices/quotes + app header
  const [companyProfile, setCompanyProfile] = useState({
    companyName: '', companyAddressLine1: '', companyAddressLine2: '',
    companyPhone: '', companyEmail: '', companyWebsite: ''
  });
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [companyMessage, setCompanyMessage] = useState({ type: '', text: '' });
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Shop Hours State (admin/management only)
  const [shopHours, setShopHours] = useState(null);
  const [shopHoursMessage, setShopHoursMessage] = useState({ type: '', text: '' });
  const [shopHoursBusy, setShopHoursBusy] = useState(false);

  // Labor Types State (admin/management only)
  const [laborTypes, setLaborTypes] = useState([]);
  const [newLaborTypeName, setNewLaborTypeName] = useState('');
  const [editingLaborType, setEditingLaborType] = useState(null);
  const [editingLaborTypeValue, setEditingLaborTypeValue] = useState('');
  const [laborTypesMessage, setLaborTypesMessage] = useState({ type: '', text: '' });
  const [laborTypeBusy, setLaborTypeBusy] = useState(false);

  // Parts Vendors State (admin/management only) — tagged vendors that drive the
  // Parts Purchase Worksheet's vendor ranking (cost/speed tier + manual order).
  const [vendors, setVendors] = useState([]);
  const [vendorTypes, setVendorTypes] = useState([]);
  const [vendorsMessage, setVendorsMessage] = useState({ type: '', text: '' });
  const [vendorBusy, setVendorBusy] = useState(false);
  // null = editor closed; { index: -1 } = adding a new vendor; index >= 0 = editing.
  const [vendorEditor, setVendorEditor] = useState(null);
  // Inline "add a new vendor type" within the editor's type dropdown.
  const [addingVendorType, setAddingVendorType] = useState(false);
  const [newVendorType, setNewVendorType] = useState('');

  useEffect(() => {
    if (isAdmin) {
      SettingsService.getSettings()
        .then(res => {
          setShopSettings({
            partMarkupPercentage: res.data.settings.partMarkupPercentage ?? 30,
            defaultLaborRate: res.data.settings.defaultLaborRate ?? 75,
            taxRate: res.data.settings.taxRate ?? 8
          });
          setLaborTypes(res.data.settings.laborTypes || []);
          setVendorTypes(res.data.settings.vendorTypes || []);
          setVendors([...(res.data.settings.customVendors || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
          setShopHours(res.data.settings.shopHours || DEFAULT_SHOP_HOURS);
          const s = res.data.settings;
          setCompanyProfile({
            companyName: s.companyName || '',
            companyAddressLine1: s.companyAddressLine1 || '',
            companyAddressLine2: s.companyAddressLine2 || '',
            companyPhone: s.companyPhone || '',
            companyEmail: s.companyEmail || '',
            companyWebsite: s.companyWebsite || ''
          });
          setCompanyLogoUrl(s.companyLogoUrl || '');
        })
        .catch(() => {});
    }
  }, [isAdmin]);

  const handleSaveCompanyProfile = async (e) => {
    e.preventDefault();
    setIsSavingCompany(true);
    setCompanyMessage({ type: '', text: '' });
    try {
      await SettingsService.updateCompanyProfile(companyProfile);
      await refreshCompany();
      setCompanyMessage({ type: 'success', text: 'Company profile saved.' });
      setTimeout(() => setCompanyMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      setCompanyMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save company profile' });
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleUploadLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setIsUploadingLogo(true);
    setCompanyMessage({ type: '', text: '' });
    try {
      const res = await SettingsService.uploadCompanyLogo(file);
      setCompanyLogoUrl(res.data.settings.companyLogoUrl || '');
      await refreshCompany();
      setCompanyMessage({ type: 'success', text: 'Logo updated.' });
      setTimeout(() => setCompanyMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      setCompanyMessage({ type: 'error', text: err.response?.data?.message || 'Failed to upload logo' });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const updateDayHours = (dayOfWeek, field, value) => {
    setShopHours(prev => prev.map(d =>
      d.dayOfWeek === dayOfWeek ? { ...d, [field]: value } : d
    ));
  };

  const handleSaveShopHours = async () => {
    setShopHoursBusy(true);
    setShopHoursMessage({ type: '', text: '' });
    try {
      const res = await SettingsService.updateShopHours(shopHours);
      setShopHours(res.data.settings.shopHours || shopHours);
      setShopHoursMessage({ type: 'success', text: 'Shop hours saved.' });
      setTimeout(() => setShopHoursMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      setShopHoursMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save shop hours' });
    } finally {
      setShopHoursBusy(false);
    }
  };

  const showLaborTypesMessage = (type, text) => {
    setLaborTypesMessage({ type, text });
    setTimeout(() => setLaborTypesMessage({ type: '', text: '' }), 3000);
  };

  const handleAddLaborType = async () => {
    const trimmed = newLaborTypeName.trim();
    if (!trimmed) return;
    setLaborTypeBusy(true);
    try {
      const res = await SettingsService.addLaborType(trimmed);
      setLaborTypes(res.data.settings.laborTypes || []);
      setNewLaborTypeName('');
      showLaborTypesMessage('success', `Added "${trimmed}"`);
    } catch (err) {
      showLaborTypesMessage('error', err.response?.data?.message || 'Failed to add labor type');
    } finally {
      setLaborTypeBusy(false);
    }
  };

  const handleRenameLaborType = async () => {
    const trimmed = editingLaborTypeValue.trim();
    if (!editingLaborType || !trimmed || trimmed === editingLaborType) {
      setEditingLaborType(null);
      setEditingLaborTypeValue('');
      return;
    }
    setLaborTypeBusy(true);
    try {
      const res = await SettingsService.renameLaborType(editingLaborType, trimmed);
      setLaborTypes(res.data.settings.laborTypes || []);
      setEditingLaborType(null);
      setEditingLaborTypeValue('');
      showLaborTypesMessage('success', `Renamed to "${trimmed}"`);
    } catch (err) {
      showLaborTypesMessage('error', err.response?.data?.message || 'Failed to rename labor type');
    } finally {
      setLaborTypeBusy(false);
    }
  };

  const handleRemoveLaborType = async (type) => {
    if (!window.confirm(`Remove "${type}" from the labor type list? Existing labor entries are unaffected.`)) return;
    setLaborTypeBusy(true);
    try {
      const res = await SettingsService.removeLaborType(type);
      setLaborTypes(res.data.settings.laborTypes || []);
      showLaborTypesMessage('success', `Removed "${type}"`);
    } catch (err) {
      showLaborTypesMessage('error', err.response?.data?.message || 'Failed to remove labor type');
    } finally {
      setLaborTypeBusy(false);
    }
  };

  // ---- Parts Vendors ----
  const showVendorsMessage = (type, text) => {
    setVendorsMessage({ type, text });
    setTimeout(() => setVendorsMessage({ type: '', text: '' }), 3000);
  };

  // Persist the whole vendor list, reindexing sortOrder to match display order
  // (the worksheet ranking uses sortOrder as its tiebreaker). The server rebuilds
  // the legacy vendorHostnames map from each vendor's hostnames.
  const persistVendors = async (next) => {
    const reindexed = next.map((v, i) => ({ ...v, sortOrder: i }));
    setVendorBusy(true);
    try {
      const res = await SettingsService.updateSettings({ customVendors: reindexed });
      setVendors([...(res.data.settings.customVendors || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      return true;
    } catch (err) {
      showVendorsMessage('error', err.response?.data?.message || 'Failed to save vendors');
      return false;
    } finally {
      setVendorBusy(false);
    }
  };

  const moveVendor = async (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= vendors.length) return;
    const next = [...vendors];
    [next[index], next[target]] = [next[target], next[index]];
    setVendors(next); // optimistic; persistVendors reconciles
    await persistVendors(next);
  };

  const handleRemoveVendor = async (index) => {
    const v = vendors[index];
    if (!window.confirm(`Remove "${v.name}" from the vendor list? Existing parts are unaffected.`)) return;
    const next = vendors.filter((_, i) => i !== index);
    if (await persistVendors(next)) showVendorsMessage('success', `Removed "${v.name}"`);
  };

  const openVendorEditor = (index) => {
    setAddingVendorType(false);
    setNewVendorType('');
    if (index === -1) {
      setVendorEditor({ index: -1, name: '', hostnames: '', makes: ['all'], usedFor: ['parts'], type: '', speedTier: 0, costTier: 0, openInTab: false });
    } else {
      const v = vendors[index];
      setVendorEditor({
        index,
        name: v.name || '',
        hostnames: (v.hostnames || []).join(', '),
        makes: (v.makes && v.makes.length ? v.makes : ['all']),
        usedFor: (v.usedFor && v.usedFor.length ? v.usedFor : ['parts']),
        type: v.type || '',
        speedTier: v.speedTier ?? 0,
        costTier: v.costTier ?? 0,
        openInTab: !!v.openInTab
      });
    }
  };

  const toggleVendorUsedFor = (val) => setVendorEditor((ed) => {
    const cur = ed.usedFor || [];
    return { ...ed, usedFor: cur.includes(val) ? cur.filter(u => u !== val) : [...cur, val] };
  });

  // Makes multi-select: 'all' is exclusive; picking a specific make drops 'all'.
  const setVendorMakesAll = () => setVendorEditor((ed) => ({ ...ed, makes: ['all'] }));
  const addVendorMake = (make) => setVendorEditor((ed) => {
    const cur = (ed.makes || []).filter(m => m !== 'all');
    return cur.includes(make) ? ed : { ...ed, makes: [...cur, make] };
  });
  const removeVendorMake = (make) => setVendorEditor((ed) => {
    const next = (ed.makes || []).filter(m => m !== make);
    return { ...ed, makes: next.length ? next : ['all'] };
  });

  const saveVendorEditor = async () => {
    const ed = vendorEditor;
    const name = ed.name.trim();
    if (!name) { showVendorsMessage('error', 'Vendor name is required'); return; }

    const dup = vendors.some((v, i) => i !== ed.index && (v.name || '').toLowerCase() === name.toLowerCase());
    if (dup) { showVendorsMessage('error', 'A vendor with that name already exists'); return; }

    const parseList = (s) => s.split(',').map(x => x.trim()).filter(Boolean);
    const hostnames = parseList(ed.hostnames)
      .map(h => h.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, ''));

    const vendorObj = {
      name,
      hostnames,
      makes: (ed.makes && ed.makes.length) ? ed.makes : ['all'],
      usedFor: (ed.usedFor && ed.usedFor.length) ? ed.usedFor : ['parts'],
      type: ed.type.trim(),
      speedTier: Number(ed.speedTier) || 0,
      costTier: Number(ed.costTier) || 0,
      openInTab: !!ed.openInTab
    };

    const next = ed.index === -1
      ? [...vendors, vendorObj]
      : vendors.map((v, i) => (i === ed.index ? { ...v, ...vendorObj } : v));

    if (await persistVendors(next)) {
      setVendorEditor(null);
      showVendorsMessage('success', ed.index === -1 ? `Added "${name}"` : `Saved "${name}"`);
    }
  };

  const handleAddVendorType = async () => {
    const name = newVendorType.trim();
    if (!name) return;
    try {
      const res = await SettingsService.addVendorType(name);
      setVendorTypes(res.data.settings.vendorTypes || []);
      setVendorEditor((ed) => ({ ...ed, type: name })); // select the new type
      setAddingVendorType(false);
      setNewVendorType('');
    } catch (err) {
      showVendorsMessage('error', err.response?.data?.message || 'Failed to add vendor type');
    }
  };

  const handleUpdateShopSettings = async (e) => {
    e.preventDefault();
    setIsUpdatingShopSettings(true);
    setShopSettingsMessage({ type: '', text: '' });
    try {
      const response = await SettingsService.updateSettings({
        partMarkupPercentage: Number(shopSettings.partMarkupPercentage),
        defaultLaborRate: Number(shopSettings.defaultLaborRate),
        taxRate: Number(shopSettings.taxRate)
      });
      setShopSettings({
        partMarkupPercentage: response.data.settings.partMarkupPercentage ?? 30,
        defaultLaborRate: response.data.settings.defaultLaborRate ?? 75,
        taxRate: response.data.settings.taxRate ?? 8
      });
      setShopSettingsMessage({
        type: 'success',
        text: response.message || 'Shop settings updated successfully!'
      });
      setTimeout(() => setShopSettingsMessage({ type: '', text: '' }), 5000);
    } catch (error) {
      setShopSettingsMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to update shop settings'
      });
    } finally {
      setIsUpdatingShopSettings(false);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  // Handle user info update
  const handleUpdateInfo = async (e) => {
    e.preventDefault();
    setIsUpdatingInfo(true);
    setInfoMessage({ type: '', text: '' });

    try {
      const response = await AuthService.updateUserInfo(userInfo);
      if (response.data?.user) {
        updateUser(response.data.user);
      }
      setInfoMessage({ type: 'success', text: 'Profile updated successfully!' });
      setIsEditingInfo(false);
      setTimeout(() => setInfoMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setInfoMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to update profile'
      });
    } finally {
      setIsUpdatingInfo(false);
    }
  };

  // Handle password update
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setIsUpdatingPassword(true);
    setPasswordMessage({ type: '', text: '' });

    if (passwordData.password !== passwordData.passwordConfirm) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match' });
      setIsUpdatingPassword(false);
      return;
    }

    if (passwordData.password.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      setIsUpdatingPassword(false);
      return;
    }

    try {
      const response = await AuthService.updatePassword(passwordData);
      if (response.token) {
        updateToken(response.token);
      }
      if (response.data?.user) {
        updateUser(response.data.user);
      }
      setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
      setPasswordData({ passwordCurrent: '', password: '', passwordConfirm: '' });
      setShowPasswordSection(false);
      setTimeout(() => setPasswordMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setPasswordMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to update password'
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'My Account', icon: 'fa-user' },
    ...(isAdmin ? [
      { id: 'company', label: 'Company Profile', icon: 'fa-building' },
      { id: 'shopSettings', label: 'Shop Settings', icon: 'fa-sliders-h' },
      { id: 'vendors', label: 'Vendors / Suppliers', icon: 'fa-truck' },
    ] : [])
  ];

  const tabButtonClass = (id) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
      activeTab === id
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-800">Settings</h1>
        <div className="flex gap-2">
          <button
            onClick={handleBack}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Back
          </button>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <i className="fas fa-sync-alt mr-2"></i>
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-4xl">
        {/* Tab bar */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={tabButtonClass(tab.id)}
              >
                <i className={`fas ${tab.icon} mr-2`}></i>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* User Profile Section */}
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Profile Information</h2>
                {!isEditingInfo && (
                  <button
                    onClick={() => setIsEditingInfo(true)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    <i className="fas fa-edit mr-1"></i>
                    Edit
                  </button>
                )}
              </div>

              {infoMessage.text && (
                <div className={`mb-4 p-3 rounded ${
                  infoMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  {infoMessage.text}
                </div>
              )}

              <form onSubmit={handleUpdateInfo}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={userInfo.name}
                      onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })}
                      disabled={!isEditingInfo}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={userInfo.email}
                      onChange={(e) => setUserInfo({ ...userInfo, email: e.target.value })}
                      disabled={!isEditingInfo}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role
                    </label>
                    <input
                      type="text"
                      value={currentUser?.role || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 capitalize"
                    />
                  </div>

                  {isEditingInfo && (
                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={isUpdatingInfo}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400"
                      >
                        {isUpdatingInfo ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingInfo(false);
                          setUserInfo({
                            name: currentUser?.name || '',
                            email: currentUser?.email || ''
                          });
                          setInfoMessage({ type: '', text: '' });
                        }}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </form>
            </div>

            {/* Password Section */}
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Password</h2>
                {!showPasswordSection && (
                  <button
                    onClick={() => setShowPasswordSection(true)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    <i className="fas fa-key mr-1"></i>
                    Change Password
                  </button>
                )}
              </div>

              {passwordMessage.text && (
                <div className={`mb-4 p-3 rounded ${
                  passwordMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  {passwordMessage.text}
                </div>
              )}

              {showPasswordSection ? (
                <form onSubmit={handleUpdatePassword}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Password
                      </label>
                      <input
                        type="password"
                        value={passwordData.passwordCurrent}
                        onChange={(e) => setPasswordData({ ...passwordData, passwordCurrent: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                        minLength={8}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={passwordData.password}
                        onChange={(e) => setPasswordData({ ...passwordData, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                        minLength={8}
                      />
                      <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={passwordData.passwordConfirm}
                        onChange={(e) => setPasswordData({ ...passwordData, passwordConfirm: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                        minLength={8}
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={isUpdatingPassword}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400"
                      >
                        {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPasswordSection(false);
                          setPasswordData({ passwordCurrent: '', password: '', passwordConfirm: '' });
                          setPasswordMessage({ type: '', text: '' });
                        }}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <p className="text-gray-600 text-sm">
                  Click "Change Password" to update your password. You'll need to provide your current password for security.
                </p>
              )}
            </div>

            {/* Account Information Section */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Account Information</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Account Created:</span>
                  <span className="font-medium text-gray-800">
                    {currentUser?.createdAt ? formatDate(currentUser.createdAt) : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Updated:</span>
                  <span className="font-medium text-gray-800">
                    {currentUser?.updatedAt ? formatDate(currentUser.updatedAt) : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {isAdmin && ['company', 'shopSettings', 'vendors'].includes(activeTab) && (
          <div className="space-y-6">
            {/* ===== Company Profile tab: Company Profile + Shop Hours ===== */}
            {activeTab === 'company' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-1">Company Profile</h2>
              <p className="text-sm text-gray-500 mb-4">
                Your company name, logo, and contact info. Shown in the app header and printed on invoices and quotes.
              </p>

              {companyMessage.text && (
                <div className={`mb-4 p-3 rounded ${
                  companyMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  {companyMessage.text}
                </div>
              )}

              {/* Logo */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 flex items-center justify-center border border-gray-200 rounded-md bg-gray-50 overflow-hidden">
                    {companyLogoUrl ? (
                      <img src={companyLogoUrl} alt="Company logo" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-xs text-gray-400">No logo</span>
                    )}
                  </div>
                  <label className={`px-4 py-2 rounded-md cursor-pointer text-white ${
                    isUploadingLogo ? 'bg-primary-400' : 'bg-primary-600 hover:bg-primary-700'
                  }`}>
                    {isUploadingLogo ? 'Uploading...' : 'Upload Logo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadLogo}
                      disabled={isUploadingLogo}
                    />
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  PNG or JPG, up to 5MB. Used in the header and on printed documents.
                </p>
              </div>

              <form onSubmit={handleSaveCompanyProfile} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={companyProfile.companyName}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, companyName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                    <input
                      type="text"
                      value={companyProfile.companyAddressLine1}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, companyAddressLine1: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                    <input
                      type="text"
                      value={companyProfile.companyAddressLine2}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, companyAddressLine2: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={companyProfile.companyPhone}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, companyPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={companyProfile.companyEmail}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, companyEmail: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <input
                      type="text"
                      value={companyProfile.companyWebsite}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, companyWebsite: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isSavingCompany}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-primary-400"
                  >
                    {isSavingCompany ? 'Saving...' : 'Save Company Profile'}
                  </button>
                </div>
              </form>
            </div>
            )}

            {/* ===== Shop Settings tab: Shop Settings + Labor Types ===== */}
            {activeTab === 'shopSettings' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-1">Shop Settings</h2>
              <p className="text-sm text-gray-500 mb-4">
                Defaults applied across new work orders, quotes, and inventory items.
              </p>

              {shopSettingsMessage.text && (
                <div className={`mb-4 p-3 rounded ${
                  shopSettingsMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  {shopSettingsMessage.text}
                </div>
              )}

              <form onSubmit={handleUpdateShopSettings}>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Default Labor Rate
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">$</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={shopSettings.defaultLaborRate}
                        onChange={(e) => setShopSettings({ ...shopSettings, defaultLaborRate: e.target.value })}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-gray-600">/ hr</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Pre-fills the rate field when adding labor to a work order or quote. Can be overridden per line.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Part Markup Percentage
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={shopSettings.partMarkupPercentage}
                        onChange={(e) => setShopSettings({ ...shopSettings, partMarkupPercentage: e.target.value })}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-gray-600">%</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Applied to part cost to calculate retail price. Currently: cost x {(1 + Number(shopSettings.partMarkupPercentage) / 100).toFixed(2)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sales Tax Rate
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={shopSettings.taxRate}
                        onChange={(e) => setShopSettings({ ...shopSettings, taxRate: e.target.value })}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-gray-600">%</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Applied to invoices, quotes, and work orders — on screen and on printed PDFs.
                    </p>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-sm text-yellow-800">
                      <i className="fas fa-exclamation-triangle mr-1"></i>
                      Changing the markup will recalculate retail prices on all quotes and work orders that do not yet have a saved invoice. The labor rate only affects newly-added labor lines.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={isUpdatingShopSettings}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400"
                    >
                      {isUpdatingShopSettings ? 'Saving...' : 'Save Shop Settings'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
            )}

            {activeTab === 'company' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-1">Shop Hours</h2>
              <p className="text-sm text-gray-500 mb-4">
                Sets the calendar viewport and multi-day appointment clipping. Times must be on the hour.
              </p>

              {shopHoursMessage.text && (
                <div className={`mb-4 p-3 rounded ${
                  shopHoursMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  {shopHoursMessage.text}
                </div>
              )}

              {shopHours && (
                <div className="space-y-2 mb-4">
                  {/* Header row */}
                  <div className="flex items-center gap-3 text-xs font-medium text-gray-500 uppercase tracking-wide px-1 pb-1 border-b border-gray-200">
                    <div className="w-24">Day</div>
                    <div className="w-16 text-center">Closed</div>
                    <div className="w-24 text-center">Open</div>
                    <div className="w-4 text-center"></div>
                    <div className="w-24 text-center">Close</div>
                    <div className="w-24 text-center">Lunch at</div>
                    <div className="w-28 text-center">Lunch length</div>
                  </div>
                  {DAY_ORDER.map(dow => {
                    const day = shopHours.find(d => d.dayOfWeek === dow);
                    if (!day) return null;
                    const disabled = day.closed;
                    return (
                      <div key={dow} className={`flex items-center gap-3 px-1 py-1.5 rounded ${disabled ? 'opacity-50' : ''}`}>
                        <div className="w-24 text-sm font-medium text-gray-700">{DAY_NAMES[dow]}</div>
                        <div className="w-16 flex justify-center">
                          <input
                            type="checkbox"
                            checked={day.closed}
                            onChange={e => updateDayHours(dow, 'closed', e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </div>
                        <select
                          value={day.open}
                          disabled={disabled}
                          onChange={e => updateDayHours(dow, 'open', e.target.value)}
                          className="w-24 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        >
                          {HOUR_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <span className="text-gray-400 text-sm w-4 text-center">–</span>
                        <select
                          value={day.close}
                          disabled={disabled}
                          onChange={e => updateDayHours(dow, 'close', e.target.value)}
                          className="w-24 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        >
                          {HOUR_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <select
                          value={day.lunchStart || ''}
                          disabled={disabled}
                          onChange={e => updateDayHours(dow, 'lunchStart', e.target.value)}
                          className="w-24 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        >
                          <option value="">No lunch</option>
                          {HOUR_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <select
                          value={day.lunchDuration || 0}
                          disabled={disabled || !day.lunchStart}
                          onChange={e => updateDayHours(dow, 'lunchDuration', Number(e.target.value))}
                          className="w-28 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        >
                          {LUNCH_DURATION_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={handleSaveShopHours}
                disabled={shopHoursBusy || !shopHours}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400"
              >
                {shopHoursBusy ? 'Saving...' : 'Save Shop Hours'}
              </button>
            </div>
            )}

            {activeTab === 'shopSettings' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-1">Labor Types</h2>
              <p className="text-sm text-gray-500 mb-4">
                Quick prefixes for labor descriptions. Picking a type prefixes the description so it reads cleanly on invoices (e.g. <span className="font-medium">Remove &amp; Replace: Front Right Caliper</span>).
              </p>

              {laborTypesMessage.text && (
                <div className={`mb-4 p-3 rounded ${
                  laborTypesMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  {laborTypesMessage.text}
                </div>
              )}

              <div className="space-y-2 mb-4">
                {laborTypes.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No labor types defined yet.</p>
                ) : (
                  laborTypes.map(type => (
                    <div key={type} className="flex items-center justify-between py-2 px-3 border border-gray-200 rounded">
                      {editingLaborType === type ? (
                        <>
                          <input
                            type="text"
                            value={editingLaborTypeValue}
                            onChange={(e) => setEditingLaborTypeValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameLaborType(); }}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleRenameLaborType}
                              disabled={laborTypeBusy}
                              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingLaborType(null); setEditingLaborTypeValue(''); }}
                              disabled={laborTypeBusy}
                              className="text-sm text-gray-600 hover:text-gray-800"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-900">{type}</span>
                          <div className="flex gap-3">
                            <button
                              onClick={() => { setEditingLaborType(type); setEditingLaborTypeValue(type); }}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              Rename
                            </button>
                            <button
                              onClick={() => handleRemoveLaborType(type)}
                              disabled={laborTypeBusy}
                              className="text-sm text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Add new labor type..."
                  value={newLaborTypeName}
                  onChange={(e) => setNewLaborTypeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddLaborType(); }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddLaborType}
                  disabled={laborTypeBusy || !newLaborTypeName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400"
                >
                  Add
                </button>
              </div>
            </div>
            )}

            {/* ===== Vendors / Suppliers tab: Parts Vendors ===== */}
            {activeTab === 'vendors' && (
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-semibold text-gray-800">Vendors</h2>
                {!vendorEditor && (
                  <button
                    onClick={() => openVendorEditor(-1)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    <i className="fas fa-plus mr-1"></i>Add Vendor
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Suppliers the worksheet ranks when sourcing parts. The worksheet sorts by cost tier (cost-priority
                jobs) or speed tier (time-priority jobs) — <span className="font-medium">lower = better</span> — and
                uses this list's order to break ties. Makes filter a vendor to specific vehicles (<span className="font-medium">all</span> = every make).
              </p>

              {vendorsMessage.text && (
                <div className={`mb-4 p-3 rounded ${
                  vendorsMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  {vendorsMessage.text}
                </div>
              )}

              {/* Add/Edit editor */}
              {vendorEditor && (
                <div className="mb-4 border border-blue-200 bg-blue-50/40 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">
                    {vendorEditor.index === -1 ? 'Add Vendor' : `Edit “${vendors[vendorEditor.index]?.name}”`}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <input
                        type="text"
                        value={vendorEditor.name}
                        onChange={(e) => setVendorEditor({ ...vendorEditor, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. FCP Euro"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Hostnames</label>
                      <input
                        type="text"
                        value={vendorEditor.hostnames}
                        onChange={(e) => setVendorEditor({ ...vendorEditor, hostnames: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="comma-separated, e.g. fcpeuro.com, ecstuning.com"
                      />
                      <p className="mt-1 text-xs text-gray-400">Used to auto-detect the seller from a pasted product URL.</p>
                    </div>
                    {/* Window behavior on the worksheet — docked popup vs. normal tab */}
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={!!vendorEditor.openInTab}
                          onChange={(e) => setVendorEditor({ ...vendorEditor, openInTab: e.target.checked })}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                        Open in a normal browser tab (not a docked window)
                      </label>
                      <p className="mt-1 text-xs text-gray-400">Turn on for marketplaces like eBay / Amazon whose links open new tabs and break the worksheet's docked layout. Direct retailers can stay docked.</p>
                    </div>
                    {/* Vendor type — independent of "Used for" */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Vendor Type</label>
                      {addingVendorType ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={newVendorType}
                            onChange={(e) => setNewVendorType(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddVendorType(); } }}
                            placeholder="New vendor type"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={handleAddVendorType}
                            disabled={!newVendorType.trim()}
                            className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 text-sm"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => { setAddingVendorType(false); setNewVendorType(''); }}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <select
                          value={vendorEditor.type || ''}
                          onChange={(e) => {
                            if (e.target.value === '__add__') { setAddingVendorType(true); return; }
                            setVendorEditor({ ...vendorEditor, type: e.target.value });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select type…</option>
                          {(vendorEditor.type && !vendorTypes.includes(vendorEditor.type) ? [vendorEditor.type, ...vendorTypes] : vendorTypes).map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                          <option value="__add__">+ Add vendor type…</option>
                        </select>
                      )}
                    </div>

                    {/* Used for — gates the parts-sourcing fields below */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Used for</label>
                      <div className="flex gap-2">
                        {[{ value: 'parts', label: 'Parts sourcing' }, { value: 'inventory', label: 'Shop Inventory' }].map((opt) => {
                          const on = (vendorEditor.usedFor || []).includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => toggleVendorUsedFor(opt.value)}
                              className={`px-3 py-1.5 text-sm rounded-md border ${
                                on ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1 text-xs text-gray-400">Parts-sourcing vendors appear in the worksheet/part picker; inventory vendors appear when stocking inventory.</p>
                    </div>

                    {/* Parts-sourcing-only: makes filter + ranking tiers */}
                    {(vendorEditor.usedFor || []).includes('parts') && (
                      <>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Makes</label>
                          {(() => {
                            const makes = vendorEditor.makes || ['all'];
                            const isAll = makes.includes('all');
                            const pill = (active) =>
                              `px-2.5 py-1 text-sm rounded-md border ${active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`;
                            return (
                              <>
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <button type="button" className={pill(isAll)} onClick={setVendorMakesAll}>All makes</button>
                                  {!isAll && makes.map((m) => (
                                    <span key={m} className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded-md border border-blue-600 bg-blue-50 text-blue-700">
                                      {m}
                                      <button type="button" onClick={() => removeVendorMake(m)} className="text-blue-500 hover:text-blue-800" title="Remove">
                                        <i className="fas fa-times text-xs"></i>
                                      </button>
                                    </span>
                                  ))}
                                </div>
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) addVendorMake(e.target.value); }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">{isAll ? '+ Pick specific make(s)…' : '+ Add make…'}</option>
                                  {VEHICLE_MAKES.filter((m) => !makes.includes(m)).map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                                <p className="mt-1 text-xs text-gray-400">
                                  "All makes" shows this vendor for every vehicle. Pick specific make(s) to limit it — that turns off "All".
                                </p>
                              </>
                            );
                          })()}
                        </div>
                        <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Cost tier</label>
                            <input
                              type="number"
                              value={vendorEditor.costTier}
                              onChange={(e) => setVendorEditor({ ...vendorEditor, costTier: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Speed tier</label>
                            <input
                              type="number"
                              value={vendorEditor.speedTier}
                              onChange={(e) => setVendorEditor({ ...vendorEditor, speedTier: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={saveVendorEditor}
                      disabled={vendorBusy || !vendorEditor.name.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400"
                    >
                      {vendorBusy ? 'Saving...' : 'Save Vendor'}
                    </button>
                    <button
                      onClick={() => setVendorEditor(null)}
                      disabled={vendorBusy}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Vendor list (display order = ranking tiebreaker) */}
              <div className="space-y-2">
                {vendors.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No vendors defined yet.</p>
                ) : (
                  vendors.map((v, index) => (
                    <div key={v._id || v.name || index} className="flex items-center gap-3 py-2 px-3 border border-gray-200 rounded">
                      <div className="flex flex-col">
                        <button
                          onClick={() => moveVendor(index, -1)}
                          disabled={vendorBusy || index === 0}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none"
                          title="Move up"
                        >
                          <i className="fas fa-chevron-up text-xs"></i>
                        </button>
                        <button
                          onClick={() => moveVendor(index, 1)}
                          disabled={vendorBusy || index === vendors.length - 1}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none"
                          title="Move down"
                        >
                          <i className="fas fa-chevron-down text-xs"></i>
                        </button>
                      </div>
                      <span className="w-6 text-xs text-gray-400">{index + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-900 font-medium">
                          {v.name}
                          {(v.usedFor && v.usedFor.length ? v.usedFor : ['parts']).map((u) => (
                            <span key={u} className="ml-1.5 text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                              {u === 'inventory' ? 'Shop Inventory' : 'Parts'}
                            </span>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          Cost {v.costTier ?? 0} · Speed {v.speedTier ?? 0}
                          {v.type ? ` · ${v.type}` : ''}
                          {' · '}
                          {(v.makes && v.makes.length ? v.makes : ['all']).join(', ')}
                          {v.hostnames && v.hostnames.length ? ` · ${v.hostnames.join(', ')}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => openVendorEditor(index)}
                        disabled={vendorBusy}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRemoveVendor(index)}
                        disabled={vendorBusy}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
