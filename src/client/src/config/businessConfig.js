// Empty company profile — the shape CompanyContext and the PDF generator fall
// back to before Settings has loaded, or when a field was never set.
//
// Deliberately blank. Company identity is per-tenant data in Settings; any
// value here would be shown to every shop that hasn't filled theirs in yet.

export const businessConfig = {
  name: '',
  addressLine1: '',
  addressLine2: '',
  phone: '',
  email: '',
  website: '',
  logo: '',
  logoPng: ''
};

export default businessConfig;
