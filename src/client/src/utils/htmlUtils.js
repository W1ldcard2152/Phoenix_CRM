/**
 * Decodes HTML entities in a string
 * @param {string} text - The input text with HTML entities
 * @returns {string} The decoded text
 */
export const decodeHtmlEntities = (text) => {
  if (!text) return '';
  
  // Create a temporary DOM element
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  
  // The browser will automatically decode the HTML entities
  return textArea.value;
};

/**
 * Sanitizes and escapes text that may contain HTML entities or special characters
 * Use this for any text displaying in JSX to prevent rendering issues
 * @param {string|number|boolean} text - Input text that may contain special characters
 * @returns {string} Sanitized text with ampersands and other characters properly escaped
 */
export const sanitizeText = (text) => {
  // Handle undefined, null, or non-string values
  if (text === undefined || text === null) return '';
  
  // Convert to string if it's a number, boolean, or other type
  const str = String(text);
  
  // First decode any already encoded HTML entities to avoid double-encoding
  let decodedText = decodeHtmlEntities(str);
  
  // Now escape ampersands to prevent JSX rendering issues
  // Replace & with &amp; but avoid double-encoding
  // This is critical for JSX rendering where unescaped ampersands cause problems
  return decodedText.replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;');
};
