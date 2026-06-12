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
    customVendors: {
      type: [String],
      default: [
        'Walmart', 'Tractor Supply', 'Advance Auto Parts', 'Autozone',
        'Napa Auto Parts', 'Rock Auto', 'eBay.com', 'Amazon.com',
        'ECS Tuning', 'FCP Euro'
      ]
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
    if (!settings.customVendors || settings.customVendors.length === 0) {
      settings.customVendors = [
        'Walmart', 'Tractor Supply', 'Advance Auto Parts', 'Autozone',
        'Napa Auto Parts', 'Rock Auto', 'eBay.com', 'Amazon.com',
        'ECS Tuning', 'FCP Euro'
      ];
      needsSave = true;
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
