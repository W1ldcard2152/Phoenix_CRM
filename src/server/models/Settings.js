const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const defaultVendorHostnames = [
  { hostname: 'walmart.com', vendor: 'Walmart' },
  { hostname: 'tractorsupply.com', vendor: 'Tractor Supply' },
  { hostname: 'advanceautoparts.com', vendor: 'Advance Auto Parts' },
  { hostname: 'autozone.com', vendor: 'Autozone' },
  { hostname: 'napaonline.com', vendor: 'Napa Auto Parts' },
  { hostname: 'rockauto.com', vendor: 'Rock Auto' },
  { hostname: 'ebay.com', vendor: 'eBay.com' },
  { hostname: 'amazon.com', vendor: 'Amazon.com' },
  { hostname: 'ecstuning.com', vendor: 'ECS Tuning' },
  { hostname: 'fcpeuro.com', vendor: 'FCP Euro' }
];

// Tagged vendor objects power the Parts Purchase Worksheet's ranking. Tiers are
// numeric (lower = better: faster / cheaper); the worksheet sorts by speedTier for
// time-priority WOs and costTier for cost-priority WOs, with sortOrder as the
// tiebreaker. `makes: ['all']` means the vendor is offered for every vehicle make.
// Defaults are derived from defaultVendorHostnames so the two stay aligned.
const defaultCustomVendors = () => defaultVendorHostnames.map((v, idx) => ({
  name: v.vendor,
  hostnames: [v.hostname],
  makes: ['all'],
  usedFor: ['parts'],
  type: '',
  speedTier: 0,
  costTier: 0,
  sortOrder: idx
}));

const SettingsSchema = new Schema(
  {
    partMarkupPercentage: {
      type: Number,
      default: 30,
      min: 0
    },
    defaultLaborRate: {
      type: Number,
      default: 75,
      min: 0
    },
    // Sales tax percentage applied to invoices/quotes/work orders (on screen and on
    // printed PDFs). Single source of truth — previously hardcoded at 8% in four places.
    taxRate: {
      type: Number,
      default: 8,
      min: 0
    },
    customVendors: {
      // Upgraded from String[] to tagged objects for the Parts Purchase Worksheet.
      // Legacy string entries are migrated in getSettings() below.
      type: [{
        name: { type: String, trim: true },
        hostnames: { type: [String], default: [] },
        makes: { type: [String], default: ['all'] }, // ['all'] or specific vehicle makes
        usedFor: { type: [String], default: ['parts'] }, // 'parts' and/or 'inventory'
        type: { type: String, trim: true, default: '' }, // e.g. dealer / marketplace / retailer
        speedTier: { type: Number, default: 0 }, // lower = faster
        costTier: { type: Number, default: 0 },  // lower = cheaper
        sortOrder: { type: Number, default: 0 }   // manual tiebreaker for ranking
      }],
      default: defaultCustomVendors
    },
    customCategories: {
      type: [String],
      default: [
        'Maintenance', 'Repair', 'Fluid', 'Software/License'
      ]
    },
    taskCategories: {
      type: [String],
      default: [
        'Training', 'Meeting', 'Break', 'Admin', 'Logistics'
      ]
    },
    inventoryCategories: {
      type: [String],
      default: [
        'Fluids', 'PPE', 'Consumables', 'Filters', 'Hardware'
      ]
    },
    packageTags: {
      type: [String],
      default: [
        'Motor Oil', 'Oil Filter', 'Transmission Fluid', 'Brake Fluid', 'Coolant', 'Power Steering Fluid'
      ]
    },
    laborTypes: {
      type: [String],
      default: [
        'Remove & Replace', 'Inspect/Diagnose', 'Repair'
      ]
    },
    vendorHostnames: {
      type: [{ hostname: String, vendor: String }],
      default: () => [...defaultVendorHostnames]
    },
    brandOverrides: {
      type: [String],
      default: ['ACDelco']
    },
    showServiceAdvisorOnInvoice: {
      type: Boolean,
      default: false
    },
    // Company / tenant identity shown in the app header and on printed
    // invoices/quotes. Defaults to the first tenant (Phoenix Automotive Group)
    // so existing deployments are unchanged; editable per-company in Settings.
    companyName: { type: String, default: 'Phoenix Automotive Group, Inc.' },
    companyAddressLine1: { type: String, default: '201 Ford St' },
    companyAddressLine2: { type: String, default: 'Newark NY 14513' },
    companyPhone: { type: String, default: '315-830-0008' },
    companyEmail: { type: String, default: 'phxautosalvage@gmail.com' },
    companyWebsite: { type: String, default: 'www.phxautogroup.com' },
    // Stable same-origin URL used by the header and PDF generation. Defaults to
    // the bundled public asset; set to /api/settings/company-logo once a logo
    // has been uploaded to S3 (see companyLogoKey).
    companyLogoUrl: { type: String, default: '/phxLogo.png' },
    companyLogoKey: { type: String, default: '' },
    shopHours: {
      type: [{
        dayOfWeek: { type: Number, required: true },
        open: { type: String, default: '08:00' },
        close: { type: String, default: '18:00' },
        closed: { type: Boolean, default: false },
        lunchStart: { type: String, default: '' },
        lunchDuration: { type: Number, default: 0 }
      }],
      default: () => [
        { dayOfWeek: 0, open: '08:00', close: '18:00', closed: true,  lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 1, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 2, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 3, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 4, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 5, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 6, open: '08:00', close: '18:00', closed: true,  lunchStart: '', lunchDuration: 0 }
      ]
    }
  },
  {
    timestamps: true
  }
);

// Singleton pattern - always returns the single settings document
SettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  } else {
    // Backfill defaults for fields added after initial document creation
    let needsSave = false;

    // Migrate customVendors from legacy String[] to tagged object[]. Read the raw
    // document via the native driver because Mongoose hydration against the new
    // object schema would discard plain-string array entries before we see them.
    const raw = await this.collection.findOne({ _id: settings._id });
    const rawVendors = raw && raw.customVendors;
    if (Array.isArray(rawVendors) && rawVendors.length > 0 && typeof rawVendors[0] === 'string') {
      const hostnameMap = (raw.vendorHostnames && raw.vendorHostnames.length)
        ? raw.vendorHostnames
        : defaultVendorHostnames;
      settings.customVendors = rawVendors.map((name, idx) => ({
        name,
        // Seed hostnames from existing vendorHostnames entries that name this vendor.
        hostnames: hostnameMap.filter(h => h.vendor === name).map(h => h.hostname),
        makes: ['all'],
        usedFor: ['parts'],
        type: '',
        speedTier: 0,
        costTier: 0,
        sortOrder: idx
      }));
      needsSave = true;
    } else if (!settings.customVendors || settings.customVendors.length === 0) {
      settings.customVendors = defaultCustomVendors();
      needsSave = true;
    } else {
      // Backfill usedFor on pre-existing tagged vendors (added before the unified
      // directory). They were all parts vendors, so default to ['parts'].
      settings.customVendors.forEach((v) => {
        if (!v.usedFor || v.usedFor.length === 0) {
          v.usedFor = ['parts'];
          needsSave = true;
        }
      });
    }
    if (!settings.customCategories || settings.customCategories.length === 0) {
      settings.customCategories = [
        'Maintenance', 'Repair', 'Fluid', 'Software/License'
      ];
      needsSave = true;
    }
    if (!settings.taskCategories || settings.taskCategories.length === 0) {
      settings.taskCategories = [
        'Training', 'Meeting', 'Break', 'Admin', 'Logistics'
      ];
      needsSave = true;
    }
    if (!settings.inventoryCategories || settings.inventoryCategories.length === 0) {
      settings.inventoryCategories = ['Fluids', 'PPE', 'Consumables', 'Filters', 'Hardware'];
      needsSave = true;
    }
    if (!settings.packageTags || settings.packageTags.length === 0) {
      settings.packageTags = ['Motor Oil', 'Oil Filter', 'Transmission Fluid', 'Brake Fluid', 'Coolant', 'Power Steering Fluid'];
      needsSave = true;
    }
    if (!settings.laborTypes || settings.laborTypes.length === 0) {
      settings.laborTypes = ['Remove & Replace', 'Inspect/Diagnose', 'Repair'];
      needsSave = true;
    }
    if (!settings.vendorHostnames || settings.vendorHostnames.length === 0) {
      settings.vendorHostnames = [...defaultVendorHostnames];
      needsSave = true;
    }
    if (!settings.brandOverrides) {
      settings.brandOverrides = ['ACDelco'];
      needsSave = true;
    }
    // Backfill company identity for documents created before these fields existed
    if (settings.companyName === undefined) { settings.companyName = 'Phoenix Automotive Group, Inc.'; needsSave = true; }
    if (settings.companyAddressLine1 === undefined) { settings.companyAddressLine1 = '201 Ford St'; needsSave = true; }
    if (settings.companyAddressLine2 === undefined) { settings.companyAddressLine2 = 'Newark NY 14513'; needsSave = true; }
    if (settings.companyPhone === undefined) { settings.companyPhone = '315-830-0008'; needsSave = true; }
    if (settings.companyEmail === undefined) { settings.companyEmail = 'phxautosalvage@gmail.com'; needsSave = true; }
    if (settings.companyWebsite === undefined) { settings.companyWebsite = 'www.phxautogroup.com'; needsSave = true; }
    if (settings.companyLogoUrl === undefined) { settings.companyLogoUrl = '/phxLogo.png'; needsSave = true; }
    if (settings.companyLogoKey === undefined) { settings.companyLogoKey = ''; needsSave = true; }
    if (!settings.shopHours || settings.shopHours.length === 0) {
      settings.shopHours = [
        { dayOfWeek: 0, open: '08:00', close: '18:00', closed: true,  lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 1, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 2, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 3, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 4, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 5, open: '08:00', close: '18:00', closed: false, lunchStart: '', lunchDuration: 0 },
        { dayOfWeek: 6, open: '08:00', close: '18:00', closed: true,  lunchStart: '', lunchDuration: 0 }
      ];
      needsSave = true;
    }
    if (needsSave) await settings.save();
  }
  return settings;
};

const Settings = mongoose.model('Settings', SettingsSchema);

module.exports = Settings;
