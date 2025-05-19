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

const InvoiceItemSchema = new Schema({
  type: {
    type: String,
    enum: ['Part', 'Labor'],
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
  taxable: {
    type: Boolean,
    default: true
  }
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
      enum: ['Draft', 'Issued', 'Paid', 'Partial', 'Overdue', 'Cancelled', 'Refunded'], // Added 'Refunded'
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
  
  // Calculate tax amount based on taxable items
  const taxableTotal = this.items
    .filter(item => item.taxable)
    .reduce((total, item) => total + item.total, 0);
  
  this.taxAmount = taxableTotal * (this.taxRate / 100);
  
  // Calculate final total
  this.total = this.subtotal + this.taxAmount;
  
  return this;
};

// Pre-save middleware to check status
InvoiceSchema.pre('save', function(next) {
  // Check if invoice is overdue
  if (this.status !== 'Paid' && 
      this.status !== 'Cancelled' && 
      new Date() > this.dueDate) {
    this.status = 'Overdue';
  }
  
  next();
});

const Invoice = mongoose.model('Invoice', InvoiceSchema);

module.exports = Invoice;
