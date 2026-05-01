const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Sub-schemas
const PaymentSchema = new Schema({
  date: {
    type: Date,
    default: Date.now
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  method: {
    type: String,
    enum: ['Cash', 'Credit Card', 'Check', 'Bank Transfer', 'Other'],
    default: 'Cash'
  },
  reference: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  }
});

const ServicePackageIncludedItemSchema = new Schema({
  name: { type: String, trim: true },
  partNumber: { type: String, trim: true },
  brand: { type: String, trim: true },
  quantity: { type: Number, default: 0 },
  unit: { type: String, trim: true }
});

const InvoiceDiscountSchema = new Schema({
  type: { type: String, enum: ['percent', 'fixed'], required: true },
  value: { type: Number, required: true, min: 0 },
  description: { type: String, trim: true },
  amount: { type: Number, required: true, min: 0 } // resolved dollar amount, locked at issue
}, { _id: false });

const InvoiceItemSchema = new Schema({
  type: {
    type: String,
    enum: ['Part', 'Labor', 'Service'],
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  partNumber: String,
  quantity: {
    type: Number,
    default: 1,
    min: 0
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  billingType: {
    type: String,
    enum: ['hourly', 'fixed'],
    default: 'hourly'
  },
  taxable: {
    type: Boolean,
    default: true
  },
  warranty: {
    type: String,
    trim: true
  },
  coreCharge: {
    type: Number,
    default: 0
  },
  coreChargeInvoiceable: {
    type: Boolean,
    default: false
  },
  includedItems: [ServicePackageIncludedItemSchema]
});

// Main Invoice Schema
const InvoiceSchema = new Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true
    },
    workOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkOrder'
    },
    invoiceDate: {
      type: Date,
      default: Date.now
    },
    dueDate: {
      type: Date,
      required: true
    },
    items: [InvoiceItemSchema],
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    discount: { type: InvoiceDiscountSchema, default: null },
    taxRate: {
      type: Number,
      default: 0
    },
    taxAmount: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['', 'Draft', 'Issued', 'Paid', 'Partial', 'Overdue', 'Cancelled', 'Refunded'], // Added empty string and 'Refunded'
      default: 'Draft'
    },
    paymentTerms: {
      type: String,
      enum: ['Due on Receipt', 'Net 15', 'Net 30', 'Net 60'],
      default: 'Due on Receipt'
    },
    payments: [PaymentSchema],
    notes: {
      type: String,
      trim: true
    },
    terms: {
      type: String,
      trim: true
    },
    // Track who created and last updated the invoice
    createdBy: {
      type: String,
      trim: true
    },
    updatedBy: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes for faster queries
InvoiceSchema.index({ customer: 1 });
InvoiceSchema.index({ vehicle: 1 });
InvoiceSchema.index({ workOrder: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ invoiceDate: 1 });
InvoiceSchema.index({ dueDate: 1 });
InvoiceSchema.index({ invoiceNumber: 1 }, { unique: true });

// Virtual for checking if invoice is overdue
InvoiceSchema.virtual('isOverdue').get(function() {
  return this.status !== 'Paid' && 
         this.status !== 'Cancelled' && 
         new Date() > this.dueDate;
});

// Virtual for calculating amount paid
InvoiceSchema.virtual('amountPaid').get(function() {
  return this.payments.reduce((total, payment) => total + payment.amount, 0);
});

// Virtual for calculating amount due
InvoiceSchema.virtual('amountDue').get(function() {
  return this.total - this.amountPaid;
});

// Method to add a payment to the invoice
InvoiceSchema.methods.addPayment = async function(paymentData) {
  this.payments.push(paymentData);
  
  // Calculate total payments
  const totalPayments = this.payments.reduce((total, payment) => total + payment.amount, 0);
  
  // Update status based on payment
  if (totalPayments >= this.total) {
    this.status = 'Paid';
  } else if (totalPayments > 0) {
    this.status = 'Partial';
  }
  
  return this.save();
};

// Method to generate a PDF of the invoice (stub for now)
InvoiceSchema.methods.generatePDF = async function() {
  // In a real implementation, this would use a PDF generation library
  return { url: `/api/invoices/${this._id}/pdf` };
};

// Method to calculate line item totals
InvoiceSchema.methods.calculateTotals = function() {
  // Calculate each line item total
  this.items.forEach(item => {
    item.total = item.quantity * item.unitPrice;
  });

  // Calculate subtotal
  this.subtotal = this.items.reduce((total, item) => total + item.total, 0);

  // Apply discount (clamped to subtotal)
  const discountAmount = (this.discount && this.discount.amount)
    ? Math.min(this.discount.amount, this.subtotal)
    : 0;

  // Calculate tax amount based on taxable items, reduced by discount
  const taxableTotal = this.items
    .filter(item => item.taxable)
    .reduce((total, item) => total + item.total, 0);
  const taxableAfterDiscount = Math.max(0, taxableTotal - discountAmount);

  this.taxAmount = taxableAfterDiscount * (this.taxRate / 100);

  // Calculate final total
  this.total = Math.max(0, this.subtotal - discountAmount + this.taxAmount);

  return this;
};

// Pre-save middleware to check status
InvoiceSchema.pre('save', function(next) {
  // Disable automatic overdue checking during routine operations
  // Only manually update invoice statuses to prevent unwanted changes during reads
  // Overdue status should be set explicitly when needed, not automatically
  
  next();
});

const Invoice = mongoose.model('Invoice', InvoiceSchema);

module.exports = Invoice;
