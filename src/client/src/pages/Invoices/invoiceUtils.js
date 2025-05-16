/**
 * Utility functions for Invoice operations
 */

/**
 * Preloads an image and returns a data URL
 * @param {string} src - Image source URL
 * @returns {Promise<string>} - Promise resolving to a data URL
 */
export const preloadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (err) => {
      reject(new Error(`Failed to load image: ${src}`));
    };
    img.src = src;
  });
};

/**
 * Processes the template DOM for PDF generation
 * This function can modify the DOM before it's captured
 * @param {HTMLElement} element - The template element
 * @param {string} logoDataUrl - The logo as a data URL
 */
export const prepareTemplateForPdf = (element, logoDataUrl) => {
  if (!element) return;
  
  // Find the logo image element
  const logoImg = element.querySelector('.logo-for-pdf');
  if (logoImg && logoDataUrl) {
    // Replace the src with the data URL
    logoImg.src = logoDataUrl;
    logoImg.style.display = 'block';
  }
  
  // Apply any other DOM modifications here
  // For example, ensure proper styles for tables, fonts, etc.
  const tables = element.querySelectorAll('table');
  tables.forEach(table => {
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    
    const cells = table.querySelectorAll('th, td');
    cells.forEach(cell => {
      cell.style.border = '1px solid #e2e8f0';
      cell.style.padding = '8px';
    });
    
    const headers = table.querySelectorAll('th');
    headers.forEach(header => {
      header.style.backgroundColor = '#f8fafc';
      header.style.fontWeight = '600';
    });
  });
};
