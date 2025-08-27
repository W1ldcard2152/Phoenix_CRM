import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import moment from 'moment-timezone';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import AppointmentService from '../../services/appointmentService';
import { formatDateTimeToET } from '../../utils/formatters';

const AppointmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [workOrderCreating, setWorkOrderCreating] = useState(false);

  useEffect(() => {
    const fetchAppointment = async () => {
      try {
        setLoading(true);
        const response = await AppointmentService.getAppointment(id);
        setAppointment(response.data.appointment);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching appointment:', err);
        setError('Failed to load appointment. Please try again later.');
        setLoading(false);
      }
    };

    fetchAppointment();
  }, [id]);

  const handleDeleteAppointment = async () => {
    try {
      await AppointmentService.deleteAppointment(id);
      navigate('/appointments');
    } catch (err) {
      console.error('Error deleting appointment:', err);
      const errorMessage = err.response?.data?.message || 'Failed to delete appointment. Please try again later.';
      setError(errorMessage);
      setDeleteModalOpen(false);
    }
  };

  const handleSendReminder = async () => {
    try {
      setReminderSending(true);
      await AppointmentService.sendAppointmentReminder(id);
      const response = await AppointmentService.getAppointment(id);
      setAppointment(response.data.appointment);
      setReminderSending(false);
      alert('Reminder sent successfully!');
    } catch (err) {
      console.error('Error sending reminder:', err);
      setError('Failed to send reminder. Please try again later.');
      setReminderSending(false);
    }
  };

  const handleCreateWorkOrder = async () => {
    try {
      setWorkOrderCreating(true);
      const response = await AppointmentService.createWorkOrderFromAppointment(id);
      setAppointment(response.data.appointment);
      setWorkOrderCreating(false);
      navigate(`/work-orders/${response.data.workOrder._id}`);
    } catch (err) {
      console.error('Error creating work order:', err);
      setError('Failed to create work order. Please try again later.');
      setWorkOrderCreating(false);
    }
  };

  // Calculate appointment duration in hours and minutes, considering ET
  const calculateDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return '';
    
    // Convert UTC times from server to ET moment objects
    const startET = moment.utc(startTime).tz('America/New_York');
    const endET = moment.utc(endTime).tz('America/New_York');
    
    const diffMs = endET.diff(startET);
    const duration = moment.duration(diffMs);
    const diffHrs = Math.floor(duration.asHours());
    const diffMins = duration.minutes();
    
    return `${diffHrs}h ${diffMins}m`;
  };

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading appointment data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="container mx-auto">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          Appointment not found.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">
          Appointment: {appointment.serviceType}
        </h1>
        <div className="flex space-x-2">
          <Button
            to={`/appointments/${id}/edit`}
            variant="primary"
          >
            Edit Appointment
          </Button>
          <Button
            variant="danger"
            onClick={() => setDeleteModalOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card title="Appointment Details">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Service Type</p>
              <p className="font-medium">{appointment.serviceType}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Date & Time</p>
              <p className="font-medium">{formatDateTimeToET(appointment.startTime)}</p>
              <p className="text-sm text-gray-600">to {formatDateTimeToET(appointment.endTime, 'h:mm A')}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Duration</p>
              <p className="font-medium">{calculateDuration(appointment.startTime, appointment.endTime)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <span 
                className={`inline-block px-2 py-1 text-xs rounded-full ${
                  appointment.status === 'Confirmed' 
                    ? 'bg-green-100 text-green-800' 
                    : appointment.status === 'Cancelled'
                      ? 'bg-red-100 text-red-800'
                      : appointment.status === 'Completed'
                        ? 'bg-blue-100 text-blue-800'
                        : appointment.status === 'No-Show'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                }`}
              >
                {appointment.status}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Technician</p>
              <p className="font-medium">{appointment.technician?.name || 'Not Assigned'}</p>
            </div>
          </div>
        </Card>

        <Card title="Customer & Vehicle">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Customer</p>
              {appointment.customer?._id ? (
                <Link
                  to={`/customers/${appointment.customer._id}`}
                  className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
                >
                  {appointment.customer?.name || 'Unknown Customer'}
                </Link>
              ) : (
                <p className="font-medium">
                  {appointment.customer?.name || 'Unknown Customer'}
                </p>
              )}
              {appointment.customer?.phone && (
                <p className="text-sm text-gray-600">{appointment.customer.phone}</p>
              )}
              {appointment.customer?.email && (
                <p className="text-sm text-gray-600">{appointment.customer.email}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">Vehicle</p>
              {appointment.vehicle?._id ? (
                <Link
                  to={`/vehicles/${appointment.vehicle._id}`}
                  className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
                >
                  {appointment.vehicle?.year} {appointment.vehicle?.make} {appointment.vehicle?.model}
                </Link>
              ) : (
                <p className="font-medium">
                  {appointment.vehicle?.year} {appointment.vehicle?.make} {appointment.vehicle?.model}
                </p>
              )}
              {appointment.vehicle?.vin && (
                <p className="text-sm text-gray-600">VIN: {appointment.vehicle.vin}</p>
              )}
              {appointment.vehicle?.licensePlate && (
                <p className="text-sm text-gray-600">License: {appointment.vehicle.licensePlate}</p>
              )}
            </div>
          </div>
        </Card>

        <Card title="Notes">
          <div className="space-y-4">
            <p className="text-gray-700">
              {appointment.notes || 'No notes available.'}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card title="Related Work Order">
          {appointment.workOrder ? (
            <div className="space-y-4">
              <p className="text-gray-700">
                This appointment has an associated work order.
              </p>
              <Button
                to={`/work-orders/${typeof appointment.workOrder === 'object' ? appointment.workOrder._id : appointment.workOrder}`}
                variant="primary"
              >
                View Work Order
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-700">
                No work order associated with this appointment.
              </p>
              <Button
                onClick={handleCreateWorkOrder}
                variant="primary"
                disabled={workOrderCreating}
              >
                {workOrderCreating ? 'Creating...' : 'Create Work Order'}
              </Button>
            </div>
          )}
        </Card>

        <Card title="Communication">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Reminder Status</p>
              <p className="font-medium">
                {appointment.reminder?.sent ? 
                  `Sent on ${formatDateTimeToET(appointment.reminder.sentAt, 'MMM D, YYYY, h:mm:ss A z')}` :
                  'Not sent yet'}
              </p>
            </div>
            <Button
              onClick={handleSendReminder}
              variant="primary"
              disabled={reminderSending || !appointment.customer}
            >
              {reminderSending ? 'Sending...' : 'Send Reminder'}
            </Button>
          </div>
        </Card>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this appointment? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="light"
                onClick={() => setDeleteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteAppointment}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentDetail;
