const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/phoenix_crm', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define the WorkOrder model
const WorkOrderSchema = new mongoose.Schema({
  status: String
}, { strict: false });

const WorkOrder = mongoose.model('WorkOrder', WorkOrderSchema);

// Status mapping from old to new
const statusMapping = {
  'Created': 'Work Order Created',
  'Scheduled': 'Appointment Scheduled',
  'Inspection/Diag Scheduled': 'Appointment Scheduled',
  'Repair Scheduled': 'Appointment Scheduled',
  'Inspected/Parts Ordered': 'Inspection/Diag Complete',
  'Completed - Awaiting Payment': 'Repair Complete - Awaiting Payment',
  'Invoiced': 'Repair Complete - Invoiced'
  // Keep these the same:
  // 'Inspection In Progress': 'Inspection In Progress',
  // 'Parts Ordered': 'Parts Ordered',
  // 'Parts Received': 'Parts Received',
  // 'Repair In Progress': 'Repair In Progress',
  // 'On Hold': 'On Hold',
  // 'Cancelled': 'Cancelled'
};

async function migrateStatuses() {
  try {
    console.log('Starting work order status migration...');
    
    for (const [oldStatus, newStatus] of Object.entries(statusMapping)) {
      const result = await WorkOrder.updateMany(
        { status: oldStatus },
        { $set: { status: newStatus } }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`✅ Updated ${result.modifiedCount} work orders from "${oldStatus}" to "${newStatus}"`);
      }
    }
    
    // Show summary of all statuses
    const statusCounts = await WorkOrder.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    console.log('\n📊 Current status distribution:');
    statusCounts.forEach(({ _id, count }) => {
      console.log(`   ${_id}: ${count} work orders`);
    });
    
    console.log('\n🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

// Run the migration
migrateStatuses();