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
    vendorHostnames: {
      type: [{ hostname: String, vendor: String }],
      default: () => [...defaultVendorHostnames]
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
    if (!settings.vendorHostnames || settings.vendorHostnames.length === 0) {
      settings.vendorHostnames = [...defaultVendorHostnames];
      needsSave = true;
    }
    if (needsSave) await settings.save();
  }
  return settings;
};

const Settings = mongoose.model('Settings', SettingsSchema);

module.exports = Settings;
