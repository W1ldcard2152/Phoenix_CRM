import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import SettingsService from '../services/settingsService';
import businessConfig from '../config/businessConfig';
import { useAuth } from './AuthContext';

const CompanyContext = createContext();

export const useCompany = () => useContext(CompanyContext);

// Communication channels this deployment has credentials for. Rides along on the
// settings fetch below, so gating comms UI costs no extra request. Assume nothing
// is available until the server says otherwise — a channel that appears late is
// far less confusing than one that appears and then vanishes.
const NO_CAPABILITIES = { sms: false, email: false };

/**
 * @returns {{sms: boolean, email: boolean}} which channels are live.
 * Pair with `useCapabilitiesLoaded()` before hiding a whole surface, so it is
 * hidden because the server said so rather than because the fetch is in flight.
 */
export const useCapabilities = () => useContext(CompanyContext)?.capabilities ?? NO_CAPABILITIES;

export const useCapabilitiesLoaded = () => useContext(CompanyContext)?.capabilitiesLoaded ?? false;

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
  const [capabilities, setCapabilities] = useState(NO_CAPABILITIES);
  const [capabilitiesLoaded, setCapabilitiesLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await SettingsService.getSettings();
      const settings = res?.data?.settings;
      if (settings) setCompany(toProfile(settings));
      setCapabilities(res?.data?.capabilities || NO_CAPABILITIES);
      setCapabilitiesLoaded(true);
    } catch (err) {
      // Non-fatal: fall back to bundled defaults. Capabilities stay unloaded, so
      // comms surfaces remain hidden rather than offering a channel we can't confirm.
      console.error('Failed to load company profile:', err);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) refresh();
  }, [isAuthenticated, refresh]);

  const value = useMemo(
    () => ({ company, capabilities, capabilitiesLoaded, refreshCompany: refresh }),
    [company, capabilities, capabilitiesLoaded, refresh]
  );

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
};

export default CompanyContext;
