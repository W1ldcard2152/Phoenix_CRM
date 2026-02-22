// Centralized business configuration
// Update this single file to change business info across all printed documents

export const businessConfig = {
  name: 'Phoenix Automotive Group, Inc.',
  addressLine1: '201 Ford St',
  addressLine2: 'Newark NY 14513',
  phone: '315-830-0008',
  email: 'phxautosalvage@gmail.com',
  website: 'www.phxautogroup.com',
  logo: '/phxLogo.svg',
  logoPng: '/phxLogo.png'  // PNG version for PDF generation (html2canvas has issues with SVG)
};

export default businessConfig;
