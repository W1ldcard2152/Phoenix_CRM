const twilio = require('twilio');
const AppError = require('../utils/appError');

// Initialize Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const fromNumber = process.env.TWILIO_PHONE_NUMBER;

/**
 * Send an SMS message
 * @param {String} to - Recipient phone number
 * @param {String} body - Message content
 * @returns {Promise<Object>} Message details
 */
exports.sendSMS = async (to, body) => {
  try {
    const message = await client.messages.create({
      body,
      from: fromNumber,
      to
    });
    
    return {
      sid: message.sid,
      status: message.status,
      dateCreated: message.dateCreated
    };
  } catch (error) {
    throw new AppError(`Failed to send SMS: ${error.message}`, 500);
  }
};

/**
 * Send an MMS message with media
 * @param {String} to - Recipient phone number
 * @param {String} body - Message content
 * @param {String} mediaUrl - URL to the media file
 * @returns {Promise<Object>} Message details
 */
exports.sendMMS = async (to, body, mediaUrl) => {
  try {
    const message = await client.messages.create({
      body,
      from: fromNumber,
      to,
      mediaUrl: [mediaUrl]
    });
    
    return {
      sid: message.sid,
      status: message.status,
      dateCreated: message.dateCreated
    };
  } catch (error) {
    throw new AppError(`Failed to send MMS: ${error.message}`, 500);
  }
};

/**
 * Send appointment reminder
 * @param {Object} appointment - Appointment object
 * @param {Object} customer - Customer object
 * @param {Object} vehicle - Vehicle object
 * @returns {Promise<Object>} Message details
 */
exports.sendAppointmentReminder = async (appointment, customer, vehicle) => {
  const date = new Date(appointment.startTime).toLocaleDateString();
  const time = new Date(appointment.startTime).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const body = `Hi ${customer.name}, this is a reminder about your appointment for your ${vehicle.year} ${vehicle.make} ${vehicle.model} on ${date} at ${time}. Reply Y to confirm or call us to reschedule.`;
  
  return exports.sendSMS(customer.phone, body);
};

/**
 * Send work order status update
 * @param {Object} workOrder - Work order object
 * @param {Object} customer - Customer object
 * @param {Object} vehicle - Vehicle object
 * @returns {Promise<Object>} Message details
 */
exports.sendStatusUpdate = async (workOrder, customer, vehicle) => {
  const body = `Hi ${customer.name}, the status of your ${vehicle.year} ${vehicle.make} ${vehicle.model} has been updated to: ${workOrder.status}. Call us for more details.`;
  
  return exports.sendSMS(customer.phone, body);
};

/**
 * Send completion notification with invoice
 * @param {Object} workOrder - Work order object
 * @param {Object} customer - Customer object
 * @param {Object} vehicle - Vehicle object
 * @param {String} invoiceUrl - URL to the invoice PDF
 * @returns {Promise<Object>} Message details
 */
exports.sendCompletionNotification = async (workOrder, customer, vehicle, invoiceUrl) => {
  const body = `Hi ${customer.name}, your ${vehicle.year} ${vehicle.make} ${vehicle.model} is ready for pickup! Total: $${workOrder.totalActual.toFixed(2)}. See attached invoice for details.`;
  
  return exports.sendMMS(customer.phone, body, invoiceUrl);
};