import html2canvas from 'html2canvas';
import businessConfig from '../config/businessConfig';
import { formatCurrency } from './formatters';

/**
 * Generate a filename based on customer/vehicle info
 * Format: lastname_firstname_make_model_YYYY-MM-DD
 */
export const generatePdfFilename = (customerName, vehicleMake, vehicleModel) => {
  const nameParts = (customerName || '').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Unknown';
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Customer';
  const make = vehicleMake || 'Unknown';
  const model = vehicleModel || 'Vehicle';
  const date = new Date().toISOString().split('T')[0];

  const sanitize = (str) => str.replace(/[^a-zA-Z0-9]/g, '');

  return `${sanitize(lastName)}_${sanitize(firstName)}_${sanitize(make)}_${sanitize(model)}_${date}`;
};

/**
 * Generate JPG image from HTML content and trigger download
 * @param {string} htmlContent - The HTML string to render
 * @param {string} filename - The filename (without extension)
 * @returns {Promise<void>}
 */
export const generatePdfFromHtml = async (htmlContent, filename) => {
  // Create a temporary iframe for isolated rendering
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '800px';
  iframe.style.height = 'auto';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          html, body { margin: 0; padding: 0; background: white; height: auto; }
          #pdf-content { padding: 30px 0 20px 0; }
        </style>
      </head>
      <body><div id="pdf-content">${htmlContent}</div></body>
    </html>
  `);
  iframeDoc.close();

  // Wait for images to load
  await new Promise(resolve => {
    const images = iframeDoc.images;
    if (images.length === 0) {
      setTimeout(resolve, 300);
      return;
    }
    let loaded = 0;
    const checkComplete = () => {
      loaded++;
      if (loaded >= images.length) {
        setTimeout(resolve, 100);
      }
    };
    for (let img of images) {
      if (img.complete) {
        checkComplete();
      } else {
        img.onload = checkComplete;
        img.onerror = checkComplete;
      }
    }
    setTimeout(resolve, 1000);
  });

  // Capture content as canvas
  const contentEl = iframeDoc.getElementById('pdf-content');
  const canvas = await html2canvas(contentEl, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff'
  });

  // Remove iframe
  document.body.removeChild(iframe);

  // Convert to JPG and download
  const jpgData = canvas.toDataURL('image/jpeg', 0.95);
  const link = document.createElement('a');
  link.download = `${filename}.jpg`;
  link.href = jpgData;
  link.click();
};

/**
 * Open print dialog with HTML content
 * @param {string} htmlContent - The HTML string to print
 */
export const printHtml = (htmlContent) => {
  const popupWin = window.open('', '_blank', 'top=0,left=0,height=auto,width=auto');
  popupWin.document.open();
  popupWin.document.write(`
    <html>
      <head>
        <title>Print Document</title>
        <style>
          body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
          @media print {
            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
        </style>
      </head>
      <body>${htmlContent}</body>
    </html>
  `);
  popupWin.document.close();
  // Wait for content to render, then trigger print
  setTimeout(() => {
    popupWin.focus();
    popupWin.print();
  }, 250);
};

/**
 * Generate document HTML for Work Orders, Quotes, and Invoices
 * This is the single source of truth for document formatting
 * Uses table-based layout for reliable print/PDF rendering
 */
export const generateDocumentHtml = (type, data) => {
  const {
    documentNumber,
    documentDate,
    customer,
    vehicle,
    vehicleMileage,
    serviceRequested,
    diagnosticNotes,
    parts = [],
    labor = [],
    customerFacingNotes = [],
    taxRate = 0,
    terms
  } = data;

  const partsTotal = parts.reduce((sum, p) => sum + (parseFloat(p.price || p.unitPrice || 0) * (parseInt(p.quantity) || 1)), 0);
  const laborTotal = labor.reduce((sum, l) => sum + (parseFloat(l.rate || l.unitPrice || 0) * (parseFloat(l.hours || l.quantity) || 0)), 0);
  const subtotal = partsTotal + laborTotal;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const typeLabels = {
    workorder: 'WORK ORDER',
    quote: 'QUOTE',
    invoice: 'INVOICE'
  };

  const numberLabels = {
    workorder: 'Work Order Number:',
    quote: 'Quote Number:',
    invoice: 'Invoice Number:'
  };

  // Format services as bullet list if it contains multiple lines
  const formatServices = (text) => {
    if (!text) return '';
    const items = text.split(/\n/).map(s => s.trim()).filter(s => s);
    if (items.length <= 1) return null;
    return items.map(item => `<li style="margin: 4px 0;">${item.replace(/^[\d]+\.\s*|-\s*/, '')}</li>`).join('');
  };

  const servicesHtml = serviceRequested ? formatServices(serviceRequested) : null;

  // Customer address formatting
  const custAddr = customer?.address;
  const hasAddress = custAddr && (custAddr.street || custAddr.city);

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; max-width: 680px; margin: 0 auto; padding: 0; color: #111827; font-size: 13px; line-height: 1.5; background: white;">
      <!-- Header -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
          <td style="vertical-align: top;">
            <img src="${window.location.origin}${businessConfig.logoPng || businessConfig.logo}" alt="${businessConfig.name}" style="height: 64px; width: auto; margin-bottom: 8px;" onerror="this.style.display='none'"/>
            <p style="margin: 0; font-size: 13px; line-height: 1.4;">${businessConfig.addressLine1}</p>
            <p style="margin: 0; font-size: 13px; line-height: 1.4;">${businessConfig.addressLine2}</p>
            <p style="margin: 0; font-size: 13px; line-height: 1.4;">${businessConfig.phone}</p>
            <p style="margin: 0; font-size: 13px; line-height: 1.4;">${businessConfig.email}</p>
            <p style="margin: 0; font-size: 13px; line-height: 1.4;">${businessConfig.website}</p>
          </td>
          <td style="text-align: right; vertical-align: top;">
            <h2 style="margin: 0 0 4px 0; font-size: 28px; font-weight: bold; color: #1f2937;">${typeLabels[type] || 'DOCUMENT'}</h2>
            <p style="margin: 0; font-size: 13px; white-space: nowrap;"><span style="font-weight: 600;">${numberLabels[type] || 'Number:'} </span>${documentNumber || 'N/A'}</p>
            <p style="margin: 0; font-size: 13px;"><span style="font-weight: 600;">Date: </span>${documentDate ? new Date(documentDate).toLocaleDateString() : 'N/A'}</p>
          </td>
        </tr>
      </table>

      <!-- Customer and Vehicle Info -->
      <table style="width: 100%; margin-bottom: 24px; font-size: 13px;" cellspacing="0" cellpadding="0">
        <tr>
          <td style="width: 50%; vertical-align: top; padding-right: 8px;">
            <table style="width: 100%; border: 1px solid #d1d5db;" cellspacing="0" cellpadding="0">
              <tr style="background-color: #f3f4f6;">
                <td style="padding: 6px 10px; font-weight: 600; border-bottom: 1px solid #d1d5db;">Customer Information:</td>
              </tr>
              <tr>
                <td style="padding: 10px;">
                  <p style="margin: 0 0 2px 0; font-weight: bold;">${customer?.name || 'N/A'}</p>
                  ${hasAddress && custAddr.street ? `<p style="margin: 0 0 2px 0;">${custAddr.street}</p>` : ''}
                  ${hasAddress && custAddr.city ? `<p style="margin: 0 0 2px 0;">${custAddr.city}${custAddr.state ? ', ' + custAddr.state : ''} ${custAddr.zip || ''}</p>` : ''}
                  <p style="margin: 0 0 2px 0;">${customer?.phone || 'N/A'}</p>
                  ${customer?.email ? `<p style="margin: 0;">${customer.email}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
          <td style="width: 50%; vertical-align: top; padding-left: 8px;">
            <table style="width: 100%; border: 1px solid #d1d5db;" cellspacing="0" cellpadding="0">
              <tr style="background-color: #f3f4f6;">
                <td style="padding: 6px 10px; font-weight: 600; border-bottom: 1px solid #d1d5db;">Vehicle Information:</td>
              </tr>
              <tr>
                <td style="padding: 10px;">
                  <p style="margin: 0 0 2px 0;"><strong>Vehicle: </strong>${vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}` : 'N/A'}</p>
                  <p style="margin: 0 0 2px 0;"><strong>VIN: </strong>${vehicle?.vin || 'N/A'}</p>
                  <p style="margin: 0 0 2px 0;"><strong>License: </strong>${vehicle?.licensePlate || 'N/A'}</p>
                  ${vehicleMileage ? `<p style="margin: 0;"><strong>Mileage: </strong>${vehicleMileage}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Services Quoted/Requested (for quotes/work orders) -->
      ${serviceRequested ? `
      <div style="margin-bottom: 16px;">
        <p style="font-weight: 700; font-size: 18px; margin: 0 0 8px 0; color: #111827; border-bottom: 2px solid #111827; padding-bottom: 4px;">${type === 'quote' ? 'Services Quoted:' : 'Service Requested:'}</p>
        <div style="border: 1px solid #d1d5db; padding: 12px; background-color: #f9fafb;">
          ${servicesHtml
            ? `<ul style="margin: 0; padding-left: 20px; list-style-type: disc;">${servicesHtml}</ul>`
            : `<p style="margin: 0;">${serviceRequested}</p>`
          }
        </div>
      </div>
      ` : ''}

      <!-- Diagnostic Notes (for work orders) -->
      ${diagnosticNotes ? `
      <div style="margin-bottom: 16px;">
        <p style="font-weight: 600; font-size: 16px; margin: 0 0 4px 0; color: #111827;">Diagnostic Notes:</p>
        <div style="border: 1px solid #d1d5db; padding: 12px;">
          <p style="margin: 0;">${diagnosticNotes}</p>
        </div>
      </div>
      ` : ''}

      <!-- Parts -->
      ${parts.length > 0 ? `
      <div style="margin-bottom: 16px;">
        <p style="font-weight: 600; font-size: 16px; margin: 0 0 4px 0; color: #111827;">Parts:</p>
        <table style="width: 100%; border: 1px solid #d1d5db; font-size: 14px;" cellspacing="0" cellpadding="8">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #d1d5db; text-align: left; font-weight: 600;">Description</th>
              <th style="border: 1px solid #d1d5db; text-align: left; font-weight: 600;">Part #</th>
              <th style="border: 1px solid #d1d5db; text-align: right; font-weight: 600;">Qty</th>
              <th style="border: 1px solid #d1d5db; text-align: right; font-weight: 600; white-space: nowrap;">Unit Price</th>
              <th style="border: 1px solid #d1d5db; text-align: right; font-weight: 600;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${parts.map(part => `
              <tr>
                <td style="border: 1px solid #d1d5db;">${part.name || part.description || ''}</td>
                <td style="border: 1px solid #d1d5db;">${part.partNumber || ''}</td>
                <td style="border: 1px solid #d1d5db; text-align: right;">${part.quantity || 1}</td>
                <td style="border: 1px solid #d1d5db; text-align: right;">${formatCurrency(part.price || part.unitPrice || 0)}</td>
                <td style="border: 1px solid #d1d5db; text-align: right;">${formatCurrency((part.price || part.unitPrice || 0) * (part.quantity || 1))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <!-- Labor -->
      ${labor.length > 0 ? `
      <div style="margin-bottom: 24px;">
        <p style="font-weight: 600; font-size: 16px; margin: 0 0 4px 0; color: #111827;">Labor:</p>
        <table style="width: 100%; border: 1px solid #d1d5db; font-size: 14px;" cellspacing="0" cellpadding="8">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #d1d5db; text-align: left; font-weight: 600;">Description</th>
              <th style="border: 1px solid #d1d5db; text-align: right; font-weight: 600;">Qty</th>
              <th style="border: 1px solid #d1d5db; text-align: right; font-weight: 600;">Rate</th>
              <th style="border: 1px solid #d1d5db; text-align: right; font-weight: 600;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${labor.map(item => {
              const qty = item.hours || item.quantity || 0;
              const rate = item.rate || item.unitPrice || 0;
              const itemTotal = qty * rate;
              return `
              <tr>
                <td style="border: 1px solid #d1d5db;">${item.description || ''}</td>
                <td style="border: 1px solid #d1d5db; text-align: right;">${qty} hrs</td>
                <td style="border: 1px solid #d1d5db; text-align: right;">${formatCurrency(rate)}/hr</td>
                <td style="border: 1px solid #d1d5db; text-align: right;">${formatCurrency(itemTotal)}</td>
              </tr>
            `;}).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <!-- Totals -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
          <td style="width: 60%;"></td>
          <td style="width: 40%;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 4px 0;">Subtotal:</td>
                <td style="padding: 4px 0; text-align: right;">${formatCurrency(subtotal)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">Tax (${taxRate}%):</td>
                <td style="padding: 4px 0; text-align: right;">${formatCurrency(taxAmount)}</td>
              </tr>
              <tr>
                <td colspan="2" style="border-top: 2px solid #374151; border-bottom: 2px solid #374151; padding: 4px 0;">
                  <table style="width: 100%;">
                    <tr>
                      <td style="font-size: 18px; font-weight: bold;">TOTAL:</td>
                      <td style="font-size: 18px; font-weight: bold; text-align: right;">${formatCurrency(total)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Customer Facing Notes (Work Order Notes) -->
      ${customerFacingNotes.length > 0 ? `
      <div style="margin-bottom: 24px; font-size: 14px;">
        <p style="font-weight: 600; font-size: 16px; margin: 0 0 8px 0; color: #111827;">Work Order Notes:</p>
        <div style="border: 1px solid #d1d5db; background-color: #f9fafb;">
          ${customerFacingNotes.map((note, index) => `
            <div style="padding: 12px;${index > 0 ? ' border-top: 1px solid #e5e7eb;' : ''}">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280;">
                ${note.createdAt ? new Date(note.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
              </p>
              <p style="margin: 0; white-space: pre-wrap; color: #374151;">${note.content || note}</p>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Terms -->
      ${terms ? `
      <div style="margin-bottom: 24px; font-size: 14px;">
        <p style="font-weight: 600; font-size: 16px; margin: 0 0 4px 0; color: #111827;">Terms & Conditions:</p>
        <div style="border: 1px solid #d1d5db; padding: 12px;">
          <p style="margin: 0; white-space: pre-wrap;">${terms}</p>
        </div>
      </div>
      ` : ''}

      <!-- Footer -->
      <div style="text-align: center; font-size: 12px; color: #4b5563; margin-top: 32px; border-top: 1px solid #d1d5db; padding-top: 16px; text-decoration: none;">
        <p style="margin: 0 0 2px 0; text-decoration: none;">Thank you for your business!</p>
        <p style="margin: 0; text-decoration: none;">${businessConfig.name} | ${businessConfig.phone} | ${businessConfig.website}</p>
      </div>
    </div>
  `;
};
