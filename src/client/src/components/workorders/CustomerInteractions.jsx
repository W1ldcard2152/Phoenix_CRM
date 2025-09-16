import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Badge, Alert, Modal, Spinner } from 'react-bootstrap';
import customerInteractionService from '../../services/customerInteractionService';
import './CustomerInteractions.css';

const CustomerInteractions = ({ workOrderId, customerId, workOrderStatus }) => {
  const [interactions, setInteractions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingInteraction, setEditingInteraction] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [interactionToDelete, setInteractionToDelete] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    contactType: 'Phone Call',
    direction: 'Outgoing',
    reason: 'Status Update',
    outcome: 'Spoke with Customer',
    notes: '',
    contactPerson: '',
    followUpRequired: false,
    followUpDate: '',
    followUpNotes: ''
  });

  // Quick templates for common interactions
  const quickTemplates = [
    { 
      label: 'Left VM - Parts', 
      data: { 
        contactType: 'Phone Call', 
        outcome: 'Left Voicemail', 
        reason: 'Parts Update',
        notes: 'Left voicemail regarding parts arrival'
      }
    },
    { 
      label: 'Sent Estimate', 
      data: { 
        contactType: 'Email', 
        outcome: 'Email Sent', 
        reason: 'Estimate Provided',
        notes: 'Estimate sent via email for approval'
      }
    },
    { 
      label: 'Approved Repairs', 
      data: { 
        contactType: 'Phone Call', 
        outcome: 'Approved', 
        reason: 'Estimate Approval',
        notes: 'Customer approved all recommended repairs'
      }
    },
    { 
      label: 'Ready for Pickup', 
      data: { 
        contactType: 'Phone Call', 
        outcome: 'Spoke with Customer', 
        reason: 'Completion Notification',
        notes: 'Notified customer vehicle is ready for pickup'
      }
    }
  ];

  useEffect(() => {
    fetchInteractions();
    fetchStats();
  }, [workOrderId]);

  const fetchInteractions = async () => {
    try {
      setLoading(true);
      const data = await customerInteractionService.getWorkOrderInteractions(workOrderId);
      setInteractions(data.map(customerInteractionService.formatInteraction));
      setError('');
    } catch (err) {
      setError('Failed to load interactions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await customerInteractionService.getInteractionStats(workOrderId);
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const interactionData = {
        ...formData,
        workOrder: workOrderId,
        customer: customerId
      };

      if (editingInteraction) {
        await customerInteractionService.updateInteraction(editingInteraction._id, interactionData);
      } else {
        await customerInteractionService.createInteraction(interactionData);
      }

      await fetchInteractions();
      await fetchStats();
      resetForm();
    } catch (err) {
      setError('Failed to save interaction');
      console.error(err);
    }
  };

  const handleEdit = (interaction) => {
    setEditingInteraction(interaction);
    setFormData({
      contactType: interaction.contactType,
      direction: interaction.direction,
      reason: interaction.reason,
      outcome: interaction.outcome,
      notes: interaction.notes || '',
      contactPerson: interaction.contactPerson || '',
      followUpRequired: interaction.followUpRequired,
      followUpDate: interaction.followUpDate ? 
        new Date(interaction.followUpDate).toISOString().split('T')[0] : '',
      followUpNotes: interaction.followUpNotes || ''
    });
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!interactionToDelete) return;
    
    try {
      await customerInteractionService.deleteInteraction(interactionToDelete._id);
      await fetchInteractions();
      await fetchStats();
      setShowDeleteModal(false);
      setInteractionToDelete(null);
    } catch (err) {
      setError('Failed to delete interaction');
      console.error(err);
    }
  };

  const handleCompleteFollowUp = async (interactionId) => {
    try {
      await customerInteractionService.completeFollowUp(interactionId);
      await fetchInteractions();
      await fetchStats();
    } catch (err) {
      setError('Failed to complete follow-up');
      console.error(err);
    }
  };

  const applyQuickTemplate = (template) => {
    setFormData(prev => ({
      ...prev,
      ...template.data
    }));
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      contactType: 'Phone Call',
      direction: 'Outgoing',
      reason: 'Status Update',
      outcome: 'Spoke with Customer',
      notes: '',
      contactPerson: '',
      followUpRequired: false,
      followUpDate: '',
      followUpNotes: ''
    });
    setEditingInteraction(null);
    setShowForm(false);
  };

  const getTimeSinceLastContact = () => {
    if (!stats || !stats.lastContact) return null;
    
    const lastContact = new Date(stats.lastContact);
    const now = new Date();
    const diffHours = Math.floor((now - lastContact) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <Card className="customer-interactions-card">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center gap-3">
          <h5 className="mb-0">Customer Interactions</h5>
          {stats && (
            <div className="interaction-stats d-flex gap-2">
              <Badge bg="info">{stats.totalInteractions} Total</Badge>
              {stats.lastContact && (
                <Badge bg="secondary">Last: {getTimeSinceLastContact()}</Badge>
              )}
              {stats.pendingFollowUps > 0 && (
                <Badge bg="warning">{stats.pendingFollowUps} Follow-ups</Badge>
              )}
              {stats.overdueFollowUps > 0 && (
                <Badge bg="danger">{stats.overdueFollowUps} Overdue</Badge>
              )}
            </div>
          )}
        </div>
        <Button 
          variant="primary" 
          size="sm"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ Log Interaction'}
        </Button>
      </Card.Header>

      <Card.Body>
        {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

        {/* Quick Templates */}
        {!showForm && (
          <div className="quick-templates mb-3">
            <small className="text-muted">Quick Log:</small>
            <div className="d-flex gap-2 flex-wrap mt-1">
              {quickTemplates.map((template, index) => (
                <Button
                  key={index}
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => applyQuickTemplate(template)}
                >
                  {template.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Interaction Form */}
        {showForm && (
          <Form onSubmit={handleSubmit} className="interaction-form mb-4 p-3 border rounded">
            <div className="row">
              <div className="col-md-3">
                <Form.Group className="mb-3">
                  <Form.Label>Contact Type</Form.Label>
                  <Form.Select
                    value={formData.contactType}
                    onChange={(e) => setFormData({ ...formData, contactType: e.target.value })}
                    required
                  >
                    <option value="Phone Call">📞 Phone Call</option>
                    <option value="Text Message">💬 Text Message</option>
                    <option value="Email">📧 Email</option>
                    <option value="In Person">👤 In Person</option>
                    <option value="Voicemail">📱 Voicemail</option>
                    <option value="Other">📝 Other</option>
                  </Form.Select>
                </Form.Group>
              </div>

              <div className="col-md-2">
                <Form.Group className="mb-3">
                  <Form.Label>Direction</Form.Label>
                  <Form.Select
                    value={formData.direction}
                    onChange={(e) => setFormData({ ...formData, direction: e.target.value })}
                  >
                    <option value="Outgoing">Outgoing</option>
                    <option value="Incoming">Incoming</option>
                  </Form.Select>
                </Form.Group>
              </div>

              <div className="col-md-4">
                <Form.Group className="mb-3">
                  <Form.Label>Reason</Form.Label>
                  <Form.Select
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    required
                  >
                    <option value="Initial Contact">Initial Contact</option>
                    <option value="Estimate Provided">Estimate Provided</option>
                    <option value="Estimate Approval">Estimate Approval</option>
                    <option value="Estimate Declined">Estimate Declined</option>
                    <option value="Parts Update">Parts Update</option>
                    <option value="Schedule Appointment">Schedule Appointment</option>
                    <option value="Status Update">Status Update</option>
                    <option value="Payment Discussion">Payment Discussion</option>
                    <option value="Additional Work Found">Additional Work Found</option>
                    <option value="Completion Notification">Completion Notification</option>
                    <option value="Follow Up">Follow Up</option>
                    <option value="Customer Question">Customer Question</option>
                    <option value="Other">Other</option>
                  </Form.Select>
                </Form.Group>
              </div>

              <div className="col-md-3">
                <Form.Group className="mb-3">
                  <Form.Label>Outcome</Form.Label>
                  <Form.Select
                    value={formData.outcome}
                    onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
                    required
                  >
                    <option value="Spoke with Customer">Spoke with Customer</option>
                    <option value="Left Voicemail">Left Voicemail</option>
                    <option value="No Answer">No Answer</option>
                    <option value="Email Sent">Email Sent</option>
                    <option value="Text Sent">Text Sent</option>
                    <option value="Approved">Approved</option>
                    <option value="Declined">Declined</option>
                    <option value="Callback Requested">Callback Requested</option>
                    <option value="Rescheduled">Rescheduled</option>
                    <option value="Payment Received">Payment Received</option>
                    <option value="Awaiting Response">Awaiting Response</option>
                    <option value="Other">Other</option>
                  </Form.Select>
                </Form.Group>
              </div>
            </div>

            <div className="row">
              <div className="col-md-3">
                <Form.Group className="mb-3">
                  <Form.Label>Contact Person (optional)</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    placeholder="e.g., John (spouse)"
                  />
                </Form.Group>
              </div>

              <div className="col-md-9">
                <Form.Group className="mb-3">
                  <Form.Label>Notes</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional details about the interaction..."
                  />
                </Form.Group>
              </div>
            </div>

            <div className="row">
              <div className="col-md-12">
                <Form.Group className="mb-3">
                  <Form.Check
                    type="checkbox"
                    label="Follow-up Required"
                    checked={formData.followUpRequired}
                    onChange={(e) => setFormData({ ...formData, followUpRequired: e.target.checked })}
                  />
                </Form.Group>
              </div>
            </div>

            {formData.followUpRequired && (
              <div className="row follow-up-section">
                <div className="col-md-3">
                  <Form.Group className="mb-3">
                    <Form.Label>Follow-up Date</Form.Label>
                    <Form.Control
                      type="date"
                      value={formData.followUpDate}
                      onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </Form.Group>
                </div>

                <div className="col-md-9">
                  <Form.Group className="mb-3">
                    <Form.Label>Follow-up Notes</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.followUpNotes}
                      onChange={(e) => setFormData({ ...formData, followUpNotes: e.target.value })}
                      placeholder="What needs to be followed up on?"
                    />
                  </Form.Group>
                </div>
              </div>
            )}

            <div className="d-flex gap-2">
              <Button type="submit" variant="primary">
                {editingInteraction ? 'Update' : 'Save'} Interaction
              </Button>
              <Button variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </Form>
        )}

        {/* Interactions Timeline */}
        <div className="interactions-timeline">
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" size="sm" />
            </div>
          ) : interactions.length === 0 ? (
            <div className="text-center text-muted py-4">
              No interactions logged yet
            </div>
          ) : (
            interactions.map((interaction) => (
              <div key={interaction._id} className="interaction-item">
                <div className="interaction-header">
                  <div className="d-flex align-items-center gap-2">
                    <span className="interaction-icon">
                      {customerInteractionService.getContactTypeIcon(interaction.contactType)}
                    </span>
                    <strong>{interaction.contactType}</strong>
                    {interaction.direction === 'Incoming' && (
                      <Badge bg="info" pill>Incoming</Badge>
                    )}
                    <Badge 
                      bg={customerInteractionService.getOutcomeClass(interaction.outcome)}
                      pill
                    >
                      {interaction.outcome}
                    </Badge>
                    {interaction.followUpRequired && !interaction.completedAt && (
                      <Badge 
                        bg={interaction.isOverdue ? 'danger' : 'warning'}
                        pill
                      >
                        Follow-up {interaction.isOverdue ? 'Overdue' : 'Required'}
                      </Badge>
                    )}
                  </div>
                  <div className="interaction-meta">
                    <small className="text-muted">
                      {interaction.displayDateTime}
                      {interaction.createdBy?.name && ` by ${interaction.createdBy.name}`}
                    </small>
                  </div>
                </div>

                <div className="interaction-body">
                  <div className="interaction-reason mb-1">
                    <strong>Reason:</strong> {interaction.reason}
                    {interaction.contactPerson && ` • Spoke with: ${interaction.contactPerson}`}
                  </div>
                  
                  {interaction.notes && (
                    <div className="interaction-notes">
                      {interaction.notes}
                    </div>
                  )}

                  {interaction.followUpRequired && (
                    <div className="follow-up-info mt-2 p-2 bg-light rounded">
                      <strong>Follow-up {interaction.followUpDate ? `by ${interaction.formattedFollowUpDate}` : 'needed'}:</strong>
                      {interaction.followUpNotes && <div>{interaction.followUpNotes}</div>}
                      {!interaction.completedAt && (
                        <Button
                          size="sm"
                          variant="success"
                          className="mt-2"
                          onClick={() => handleCompleteFollowUp(interaction._id)}
                        >
                          Mark Complete
                        </Button>
                      )}
                      {interaction.completedAt && (
                        <div className="text-success mt-1">
                          ✓ Completed {interaction.completedBy?.name && `by ${interaction.completedBy.name}`}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="interaction-actions">
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => handleEdit(interaction)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-danger"
                    onClick={() => {
                      setInteractionToDelete(interaction);
                      setShowDeleteModal(true);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card.Body>

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this interaction? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </Card>
  );
};

export default CustomerInteractions;