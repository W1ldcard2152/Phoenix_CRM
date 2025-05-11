// adminSeed.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/server/models/User');

// Get the MongoDB URI directly from the environment variables
// This assumes your .env file has the correct URI for the auto-repair-crm database
const uri = process.env.MONGODB_URI;

console.log('Connecting to database using MONGODB_URI from .env');

// MongoDB connection
mongoose
  .connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => {
    console.log('Connected to MongoDB');
    createAdminUser();
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

async function createAdminUser() {
  try {
    // Check if an admin user already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    
    if (existingAdmin) {
      console.log('Admin user already exists:', existingAdmin.email);
      mongoose.disconnect();
      return;
    }

    // Create new admin user
    const adminUser = new User({
      name: 'Admin User',
      email: 'phxautosalvage@gmail.com',
      password: 'admin123456',  // This will be hashed by the pre-save hook
      passwordConfirm: 'admin123456',
      role: 'admin'
    });

    // Save admin user (password hashing happens in the pre-save hook)
    await adminUser.save();
    
    console.log('Admin user created successfully!');
    console.log('Email:', adminUser.email);
    console.log('Password: admin123456');
    console.log('Please change this password after first login');
    
    // Disconnect from MongoDB
    mongoose.disconnect();
  } catch (error) {
    console.error('Error creating admin user:', error);
    mongoose.disconnect();
    process.exit(1);
  }
}