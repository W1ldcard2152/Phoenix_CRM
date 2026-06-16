import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import SettingsService from '../services/settingsService';
import businessConfig from '../config/businessConfig';
import { useAuth } from './AuthContext';

const CompanyContext = createContext();

export const useCompany = () => useContext(CompanyContext);

// Maps a fetched Settings document onto the company-profile shape, falling back
// to the bundled defaults in businessConfig when a field is missing.
const toProfile = (settings = {}) => ({
  name: settings.companyName || businessConfig.name,
  addressLine1: settings.companyAddressLine1 ?? businessConfig.addressLine1,
  addressLine2: settings.companyAddressLine2 ?? businessConfig.addressLine2,
  phone: settings.companyPhone ?? businessConfig.phone,
  email: settings.companyEmail ?? businessConfig.email,
  website: settings.companyWebsite ?? businessConfig.website,
  logo: settings.companyLogoUrl || businessConfig.logo,
  // PDFs render the same logo (no separate SVG/PNG split now that it's an upload)
  logoPng: settings.companyLogoUrl || businessConfig.logoPng
});

export const CompanyProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [company, setCompany] = useState(toProfile());

  const refresh = useCallback(async () => {
    try {
      const res = await SettingsService.getSettings();
      const settings = res?.data?.settings;
      if (settings) setCompany(toProfile(settings));
    } catch (err) {
      // Non-fatal: fall back to bundled defaults
      console.error('Failed to load company profile:', err);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) refresh();
  }, [isAuthenticated, refresh]);

  return (
    <CompanyContext.Provider value={{ company, refreshCompany: refresh }}>
      {children}
    </CompanyContext.Provider>
  );
};

export default CompanyContext;
