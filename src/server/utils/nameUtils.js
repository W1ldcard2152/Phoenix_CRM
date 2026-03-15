/**
 * Returns displayName if set, otherwise first word of name.
 * Used for customer-facing documents to protect staff privacy.
 * @param {Object} entity - User or Technician object with name and optional displayName
 * @returns {string}
 */
const getCustomerFacingName = (entity) => {
  if (!entity) return '';
  if (entity.displayName) return entity.displayName;
  return (entity.name || '').split(' ')[0];
};

module.exports = { getCustomerFacingName };
