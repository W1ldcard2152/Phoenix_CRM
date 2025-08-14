// Script to inspect specific invoice INV-20250812-6074 and understand the data structure
require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});

// Import the Invoice model and related models
const Invoice = require('./src/server/models/Invoice');
const WorkOrder = require('./src/server/models/WorkOrder');
const Customer = require('./src/server/models/Customer');
const Vehicle = require('./src/server/models/Vehicle');

async function inspectInvoice() {
  try {
    console.log('Looking for invoice INV-20250812-6074...');
    
    // Find the specific invoice
    const invoice = await Invoice.findOne({ invoiceNumber: 'INV-20250812-6074' })
      .populate('workOrder customer vehicle');
    
    if (!invoice) {
      console.log('Invoice INV-20250812-6074 not found');
      process.exit(0);
    }
    
    console.log('\nInvoice structure:');
    console.log('Invoice Number:', invoice.invoiceNumber);
    console.log('Has items array:', !!invoice.items);
    console.log('Has parts array:', !!invoice.parts);
    console.log('Has labor array:', !!invoice.labor);
    
    if (invoice.items) {
      console.log('\nItems array length:', invoice.items.length);
      invoice.items.forEach((item, index) => {
        console.log(`Item ${index}:`, {
          type: item.type,
          description: item.description,
          partNumber: item.partNumber,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total
        });
      });
    }
    
    if (invoice.parts) {
      console.log('\nParts array length:', invoice.parts.length);
      invoice.parts.forEach((part, index) => {
        console.log(`Part ${index}:`, part);
      });
    }
    
    if (invoice.labor) {
      console.log('\nLabor array length:', invoice.labor.length);
      invoice.labor.forEach((labor, index) => {
        console.log(`Labor ${index}:`, labor);
      });
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('Error inspecting invoice:', error);
    process.exit(1);
  }
}

// Run the inspection
inspectInvoice();