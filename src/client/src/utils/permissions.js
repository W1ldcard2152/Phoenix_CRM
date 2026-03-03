/**
 * Role-based permission helpers for client-side UI rendering.
 * These do NOT replace server-side enforcement — they only control button/link visibility.
 */

export const hasRole = (user, ...roles) => {
  return user && roles.includes(user.role);
};

export const isAdminOrManagement = (user) => hasRole(user, 'admin', 'management');

export const isOfficeStaff = (user) => hasRole(user, 'admin', 'management', 'service-writer');

export const isTechnician = (user) => hasRole(user, 'technician');

export const permissions = {
  customers: {
    canView: (user) => isOfficeStaff(user),
    canCreate: (user) => isOfficeStaff(user),
    canEdit: (user) => isOfficeStaff(user),
    canDelete: (user) => isAdminOrManagement(user),
  },
  vehicles: {
    canView: (user) => isOfficeStaff(user),
    canCreate: (user) => isOfficeStaff(user),
    canEdit: (user) => isOfficeStaff(user),
    canDelete: (user) => isAdminOrManagement(user),
  },
  workOrders: {
    canView: () => true, // all authenticated
    canCreate: (user) => isOfficeStaff(user),
    canEdit: (user) => isOfficeStaff(user),
    canEditOwn: (user) => isTechnician(user), // technicians edit their assigned WOs
    canDelete: (user) => isAdminOrManagement(user),
    canChangeStatus: (user) => isOfficeStaff(user),
    canChangeStatusOwn: (user) => isTechnician(user),
    canAddParts: (user) => isOfficeStaff(user),
    canAddLabor: (user) => isOfficeStaff(user),
    canAddLaborOwn: (user) => isTechnician(user),
    canProcessReceipt: (user) => isOfficeStaff(user),
    canGenerateInvoice: (user) => isOfficeStaff(user),
    canSplit: (user) => isOfficeStaff(user),
  },
  quotes: {
    canView: (user) => isOfficeStaff(user),
    canCreate: (user) => isOfficeStaff(user),
    canEdit: (user) => isOfficeStaff(user),
    canDelete: (user) => isOfficeStaff(user),
    canConvert: (user) => isOfficeStaff(user),
  },
  appointments: {
    canView: (user) => isOfficeStaff(user),
    canCreate: (user) => isOfficeStaff(user),
    canEdit: (user) => isOfficeStaff(user),
    canDelete: (user) => isAdminOrManagement(user),
  },
  invoices: {
    canView: (user) => isOfficeStaff(user),
    canCreate: (user) => isOfficeStaff(user),
    canEdit: (user) => isOfficeStaff(user),
    canDelete: (user) => isAdminOrManagement(user),
  },
  parts: {
    canView: () => true, // all authenticated
    canCreate: (user) => isAdminOrManagement(user),
    canEdit: (user) => isAdminOrManagement(user),
    canDelete: (user) => isAdminOrManagement(user),
  },
  media: {
    canView: () => true,
    canUpload: () => true,
    canShare: (user) => isOfficeStaff(user),
    canDelete: (user) => isOfficeStaff(user),
  },
  feedback: {
    canCreate: () => true, // all authenticated
    canView: (user) => hasRole(user, 'admin'),
    canArchive: (user) => hasRole(user, 'admin'),
    canDelete: (user) => hasRole(user, 'admin'),
  },
  technicians: {
    canView: () => true,
    canCreate: (user) => isAdminOrManagement(user),
    canEdit: (user) => isAdminOrManagement(user),
    canDelete: (user) => hasRole(user, 'admin'),
  },
  scheduleBlocks: {
    canView: (user) => isOfficeStaff(user),
    canCreate: (user) => isOfficeStaff(user),
    canEdit: (user) => isOfficeStaff(user),
    canDelete: (user) => isAdminOrManagement(user),
  },
  admin: {
    canAccess: (user) => isAdminOrManagement(user),
  },
};

/**
 * Applies role-based visibility to a schedule block for calendar display.
 * - Admin/Management: full details (indigo cards)
 * - Service Writers: grey "Unavailable" (no title, category, or reason)
 * - Technicians: own blocks shown in full, others' blocks shown as "Unavailable"
 */
export const applyScheduleBlockVisibility = (block, user) => {
  if (!block || !block.isScheduleBlock) return block;

  const role = user?.role;

  // Admin/Management see everything
  if (role === 'admin' || role === 'management') {
    return block;
  }

  // Technicians: own blocks in full, others redacted
  if (role === 'technician') {
    const userTechId = (user?.technician?._id || user?.technician || '').toString();
    const blockTechId = (block.technician?._id || block.technician || '').toString();

    if (userTechId && blockTechId && userTechId === blockTechId) {
      return block;
    }
  }

  // Service writers + other technicians' blocks: redact
  return {
    ...block,
    title: 'Unavailable',
    category: null,
    status: 'Unavailable',
    _isRedacted: true,
  };
};
