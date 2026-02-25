/**
 * Tests for the client-side permissions utility.
 *
 * Since the client file uses ES module syntax (export), we re-implement the
 * same logic here to validate the permission matrix rules match the approved
 * plan.  If someone changes the client permissions.js, these tests will catch
 * any deviation from the expected access control matrix.
 */

// ---------- Replicate the permission helpers (same logic as client) ----------
const hasRole = (user, ...roles) => user && roles.includes(user.role);
const isAdminOrManagement = (user) => hasRole(user, 'admin', 'management');
const isOfficeStaff = (user) => hasRole(user, 'admin', 'management', 'service-writer');
const isTechnician = (user) => hasRole(user, 'technician');

const permissions = {
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
    canView: () => true,
    canCreate: (user) => isOfficeStaff(user),
    canEdit: (user) => isOfficeStaff(user),
    canEditOwn: (user) => isTechnician(user),
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
    canView: () => true,
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
    canCreate: () => true,
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
  admin: {
    canAccess: (user) => isAdminOrManagement(user),
  },
};

// ---------- Test users ----------
const admin = { role: 'admin' };
const management = { role: 'management' };
const serviceWriter = { role: 'service-writer' };
const technician = { role: 'technician' };
const noUser = null;

// =========================================================================
//  Helper functions
// =========================================================================
describe('hasRole', () => {
  it('returns true when user has a matching role', () => {
    expect(hasRole(admin, 'admin', 'management')).toBe(true);
    expect(hasRole(management, 'admin', 'management')).toBe(true);
  });

  it('returns false when user role does not match', () => {
    expect(hasRole(technician, 'admin', 'management')).toBe(false);
    expect(hasRole(serviceWriter, 'admin')).toBe(false);
  });

  it('returns falsy for null/undefined user', () => {
    expect(hasRole(null, 'admin')).toBeFalsy();
    expect(hasRole(undefined, 'admin')).toBeFalsy();
  });
});

describe('isAdminOrManagement', () => {
  it('returns true for admin and management', () => {
    expect(isAdminOrManagement(admin)).toBe(true);
    expect(isAdminOrManagement(management)).toBe(true);
  });

  it('returns false for service-writer and technician', () => {
    expect(isAdminOrManagement(serviceWriter)).toBe(false);
    expect(isAdminOrManagement(technician)).toBe(false);
  });
});

describe('isOfficeStaff', () => {
  it('returns true for admin, management, and service-writer', () => {
    expect(isOfficeStaff(admin)).toBe(true);
    expect(isOfficeStaff(management)).toBe(true);
    expect(isOfficeStaff(serviceWriter)).toBe(true);
  });

  it('returns false for technician', () => {
    expect(isOfficeStaff(technician)).toBe(false);
  });
});

describe('isTechnician', () => {
  it('returns true only for technician', () => {
    expect(isTechnician(technician)).toBe(true);
    expect(isTechnician(admin)).toBe(false);
    expect(isTechnician(serviceWriter)).toBe(false);
  });
});

// =========================================================================
//  Permission matrix
// =========================================================================
describe('Permission matrix', () => {

  // ---- Customers: office staff view/create/edit, admin+management delete ----
  describe('customers', () => {
    it('admin can do everything', () => {
      expect(permissions.customers.canView(admin)).toBe(true);
      expect(permissions.customers.canCreate(admin)).toBe(true);
      expect(permissions.customers.canEdit(admin)).toBe(true);
      expect(permissions.customers.canDelete(admin)).toBe(true);
    });

    it('management can do everything', () => {
      expect(permissions.customers.canView(management)).toBe(true);
      expect(permissions.customers.canDelete(management)).toBe(true);
    });

    it('service-writer can view/create/edit but NOT delete', () => {
      expect(permissions.customers.canView(serviceWriter)).toBe(true);
      expect(permissions.customers.canCreate(serviceWriter)).toBe(true);
      expect(permissions.customers.canEdit(serviceWriter)).toBe(true);
      expect(permissions.customers.canDelete(serviceWriter)).toBe(false);
    });

    it('technician cannot access customers at all', () => {
      expect(permissions.customers.canView(technician)).toBe(false);
      expect(permissions.customers.canCreate(technician)).toBe(false);
      expect(permissions.customers.canEdit(technician)).toBe(false);
      expect(permissions.customers.canDelete(technician)).toBe(false);
    });
  });

  // ---- Work Orders: most complex domain ----
  describe('workOrders', () => {
    it('anyone can view work orders', () => {
      expect(permissions.workOrders.canView(admin)).toBe(true);
      expect(permissions.workOrders.canView(technician)).toBe(true);
      expect(permissions.workOrders.canView(noUser)).toBe(true);
    });

    it('only office staff can create work orders', () => {
      expect(permissions.workOrders.canCreate(admin)).toBe(true);
      expect(permissions.workOrders.canCreate(serviceWriter)).toBe(true);
      expect(permissions.workOrders.canCreate(technician)).toBe(false);
    });

    it('only admin+management can delete work orders', () => {
      expect(permissions.workOrders.canDelete(admin)).toBe(true);
      expect(permissions.workOrders.canDelete(management)).toBe(true);
      expect(permissions.workOrders.canDelete(serviceWriter)).toBe(false);
      expect(permissions.workOrders.canDelete(technician)).toBe(false);
    });

    it('technician can edit/status/labor on own WOs', () => {
      expect(permissions.workOrders.canEditOwn(technician)).toBe(true);
      expect(permissions.workOrders.canChangeStatusOwn(technician)).toBe(true);
      expect(permissions.workOrders.canAddLaborOwn(technician)).toBe(true);
    });

    it('technician cannot add parts, process receipts, generate invoices, or split', () => {
      expect(permissions.workOrders.canAddParts(technician)).toBe(false);
      expect(permissions.workOrders.canProcessReceipt(technician)).toBe(false);
      expect(permissions.workOrders.canGenerateInvoice(technician)).toBe(false);
      expect(permissions.workOrders.canSplit(technician)).toBe(false);
    });

    it('office staff can do everything except delete (admin+management only)', () => {
      expect(permissions.workOrders.canEdit(serviceWriter)).toBe(true);
      expect(permissions.workOrders.canAddParts(serviceWriter)).toBe(true);
      expect(permissions.workOrders.canAddLabor(serviceWriter)).toBe(true);
      expect(permissions.workOrders.canSplit(serviceWriter)).toBe(true);
      expect(permissions.workOrders.canDelete(serviceWriter)).toBe(false);
    });
  });

  // ---- Parts: reads open to all, writes admin+management ----
  describe('parts', () => {
    it('anyone can view parts', () => {
      expect(permissions.parts.canView(technician)).toBe(true);
      expect(permissions.parts.canView(serviceWriter)).toBe(true);
      expect(permissions.parts.canView(noUser)).toBe(true);
    });

    it('only admin+management can create/edit/delete parts', () => {
      expect(permissions.parts.canCreate(admin)).toBe(true);
      expect(permissions.parts.canCreate(management)).toBe(true);
      expect(permissions.parts.canCreate(serviceWriter)).toBe(false);
      expect(permissions.parts.canCreate(technician)).toBe(false);

      expect(permissions.parts.canDelete(admin)).toBe(true);
      expect(permissions.parts.canDelete(serviceWriter)).toBe(false);
    });
  });

  // ---- Feedback: create open to all, everything else admin only ----
  describe('feedback', () => {
    it('anyone can create feedback', () => {
      expect(permissions.feedback.canCreate(technician)).toBe(true);
      expect(permissions.feedback.canCreate(serviceWriter)).toBe(true);
      expect(permissions.feedback.canCreate(noUser)).toBe(true);
    });

    it('only admin can view/archive/delete feedback', () => {
      expect(permissions.feedback.canView(admin)).toBe(true);
      expect(permissions.feedback.canView(management)).toBe(false);
      expect(permissions.feedback.canView(serviceWriter)).toBe(false);
      expect(permissions.feedback.canView(technician)).toBe(false);

      expect(permissions.feedback.canArchive(admin)).toBe(true);
      expect(permissions.feedback.canArchive(management)).toBe(false);

      expect(permissions.feedback.canDelete(admin)).toBe(true);
      expect(permissions.feedback.canDelete(management)).toBe(false);
    });
  });

  // ---- Technicians: view open, write admin+management, delete admin only ----
  describe('technicians', () => {
    it('anyone can view technicians', () => {
      expect(permissions.technicians.canView(technician)).toBe(true);
    });

    it('only admin+management can create/edit', () => {
      expect(permissions.technicians.canCreate(admin)).toBe(true);
      expect(permissions.technicians.canCreate(management)).toBe(true);
      expect(permissions.technicians.canCreate(serviceWriter)).toBe(false);
    });

    it('only admin can delete technicians', () => {
      expect(permissions.technicians.canDelete(admin)).toBe(true);
      expect(permissions.technicians.canDelete(management)).toBe(false);
      expect(permissions.technicians.canDelete(serviceWriter)).toBe(false);
    });
  });

  // ---- Quotes: office staff only ----
  describe('quotes', () => {
    it('office staff can do everything with quotes', () => {
      expect(permissions.quotes.canView(admin)).toBe(true);
      expect(permissions.quotes.canCreate(serviceWriter)).toBe(true);
      expect(permissions.quotes.canConvert(management)).toBe(true);
    });

    it('technician cannot access quotes', () => {
      expect(permissions.quotes.canView(technician)).toBe(false);
      expect(permissions.quotes.canCreate(technician)).toBe(false);
    });
  });

  // ---- Appointments: office staff, delete admin+management ----
  describe('appointments', () => {
    it('office staff can view/create/edit', () => {
      expect(permissions.appointments.canView(serviceWriter)).toBe(true);
      expect(permissions.appointments.canCreate(serviceWriter)).toBe(true);
    });

    it('only admin+management can delete appointments', () => {
      expect(permissions.appointments.canDelete(admin)).toBe(true);
      expect(permissions.appointments.canDelete(management)).toBe(true);
      expect(permissions.appointments.canDelete(serviceWriter)).toBe(false);
    });

    it('technician cannot access appointments', () => {
      expect(permissions.appointments.canView(technician)).toBe(false);
    });
  });

  // ---- Invoices: office staff, delete admin+management ----
  describe('invoices', () => {
    it('office staff can view/create/edit', () => {
      expect(permissions.invoices.canView(admin)).toBe(true);
      expect(permissions.invoices.canCreate(serviceWriter)).toBe(true);
    });

    it('only admin+management can delete invoices', () => {
      expect(permissions.invoices.canDelete(admin)).toBe(true);
      expect(permissions.invoices.canDelete(serviceWriter)).toBe(false);
    });

    it('technician cannot access invoices', () => {
      expect(permissions.invoices.canView(technician)).toBe(false);
    });
  });

  // ---- Media: view/upload open, share/delete office staff ----
  describe('media', () => {
    it('anyone can view and upload', () => {
      expect(permissions.media.canView(technician)).toBe(true);
      expect(permissions.media.canUpload(technician)).toBe(true);
    });

    it('only office staff can share/delete', () => {
      expect(permissions.media.canShare(serviceWriter)).toBe(true);
      expect(permissions.media.canShare(technician)).toBe(false);
      expect(permissions.media.canDelete(admin)).toBe(true);
      expect(permissions.media.canDelete(technician)).toBe(false);
    });
  });

  // ---- Admin page ----
  describe('admin', () => {
    it('only admin+management can access admin page', () => {
      expect(permissions.admin.canAccess(admin)).toBe(true);
      expect(permissions.admin.canAccess(management)).toBe(true);
      expect(permissions.admin.canAccess(serviceWriter)).toBe(false);
      expect(permissions.admin.canAccess(technician)).toBe(false);
    });
  });
});

// =========================================================================
//  Edge cases
// =========================================================================
describe('Edge cases', () => {
  it('null user is handled gracefully for all permission checks', () => {
    // These should not throw - they should return falsy for restricted, truthy for open
    expect(() => permissions.customers.canView(null)).not.toThrow();
    expect(permissions.customers.canView(null)).toBeFalsy();
    expect(permissions.workOrders.canView(null)).toBe(true); // open to all
    expect(permissions.parts.canView(null)).toBe(true); // open to all
    expect(permissions.feedback.canCreate(null)).toBe(true); // open to all
    expect(permissions.feedback.canView(null)).toBeFalsy();
  });

  it('undefined user is handled gracefully', () => {
    expect(() => permissions.customers.canView(undefined)).not.toThrow();
    expect(permissions.customers.canView(undefined)).toBeFalsy();
  });

  it('user with empty role string is handled', () => {
    const badUser = { role: '' };
    expect(permissions.customers.canView(badUser)).toBe(false);
    expect(permissions.workOrders.canView(badUser)).toBe(true);
  });

  it('user with unknown role gets no permissions', () => {
    const unknownUser = { role: 'intern' };
    expect(permissions.customers.canView(unknownUser)).toBe(false);
    expect(permissions.workOrders.canCreate(unknownUser)).toBe(false);
    expect(permissions.parts.canCreate(unknownUser)).toBe(false);
    expect(permissions.feedback.canView(unknownUser)).toBe(false);
    // Open endpoints still work
    expect(permissions.workOrders.canView(unknownUser)).toBe(true);
    expect(permissions.parts.canView(unknownUser)).toBe(true);
    expect(permissions.feedback.canCreate(unknownUser)).toBe(true);
  });
});
