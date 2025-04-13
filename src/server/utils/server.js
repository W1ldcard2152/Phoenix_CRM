const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });

// Import routes
const customerRoutes = require('./src/server/routes/customerRoutes');
const vehicleRoutes = require('./src/server/routes/vehicleRoutes');
const workOrderRoutes = require('./src/routes/workOrderRoutes');
const appointmentRoutes = require('./src/routes/appointmentRoutes');
const mediaRoutes = require('./src/server/routes/mediaRoutes');

// Use routes
app.use('/api/customers', customerRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/workorders', workOrderRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/media', mediaRoutes);

// Basic route for testing
app.get('/', (req, res) => {
  res.send('Auto Repair CRM API is running');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;