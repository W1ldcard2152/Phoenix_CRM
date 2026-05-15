import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import { MobileCard, MobileSection, MobileContainer } from '../../components/common/ResponsiveTable';
import QuoteService from '../../services/quoteService';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import usePersistedState from '../../hooks/usePersistedState';

const QuoteList = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Sort by last activity (status sort key) by default — so checking Sent / Followed-Up
  // visibly bumps the row to the top. Key is versioned so existing users get the new default.
  const [sortConfig, setSortConfig] = usePersistedState('quotes:sortConfig:v2', [{ key: 'status', direction: 'desc' }]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [converting, setConverting] = useState(null);
  const [showArchived, setShowArchived] = usePersistedState('quotes:showArchived', false);

  const [actionInFlight, setActionInFlight] = useState(null);
  const [closeModal, setCloseModal] = useState(null); // { quote, choice: 'declined' | 'archived' }

  const customerParam = searchParams.get('customer');
  const vehicleParam = searchParams.get('vehicle');

  const fetchQuotes = useCallback(async () => {
    try {
      setLoading(true);
      const filters = {};
      if (customerParam) filters.customer = customerParam;
      if (vehicleParam) filters.vehicle = vehicleParam;
      if (showArchived) filters.includeArchived = true;

      const response = await QuoteService.getAllQuotes(filters);
      setQuotes(response.data.quotes || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching quotes:', err);
      setError('Failed to load quotes.');
    } finally {
      setLoading(false);
    }
  }, [customerParam, vehicleParam, showArchived]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  // Status derivation: based on time since last contact (created OR sent OR followed-up),
  // with archived/declined overriding the time-based labels.
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const NEEDS_ATTENTION_DAYS = 14;
  const ARCHIVE_PROMPT_DAYS = 30;

  const getLastContactDate = (quote) => {
    const comms = quote.quoteCommunications || {};
    const candidates = [quote.date, comms.sentAt, comms.followedUpAt, comms.secondFollowedUpAt]
      .filter(Boolean)
      .map(d => new Date(d).getTime());
    return new Date(candidates.length ? Math.max(...candidates) : new Date(quote.date).getTime());
  };

  const getDaysSinceLastContact = (quote) => {
    return Math.floor((Date.now() - getLastContactDate(quote).getTime()) / MS_PER_DAY);
  };

  const getStatusBadge = (quote) => {
    if (quote.status === 'Quote - Declined') {
      return { label: 'Declined', className: 'bg-red-100 text-red-800', icon: 'fa-ban' };
    }
    if (quote.status === 'Quote - Archived') {
      return { label: 'Archived', className: 'bg-gray-100 text-gray-600', icon: 'fa-archive' };
    }
    const days = getDaysSinceLastContact(quote);
    if (days > ARCHIVE_PROMPT_DAYS) {
      return { label: 'Archive?', className: 'bg-orange-100 text-orange-800', icon: 'fa-exclamation-triangle' };
    }
    if (days > NEEDS_ATTENTION_DAYS) {
      return { label: 'Needs Attention', className: 'bg-yellow-100 text-yellow-800', icon: 'fa-clock' };
    }
    return { label: 'Open', className: 'bg-green-100 text-green-800', icon: null };
  };

  const isTerminal = (quote) => quote.status === 'Quote - Archived' || quote.status === 'Quote - Declined';

  // Service display
  const getServiceDisplay = (quote) => {
    if (quote.services && quote.services.length > 0) {
      const first = quote.services[0].description;
      if (quote.services.length > 1) {
        return `${first} (+${quote.services.length - 1} more)`;
      }
      return first;
    }
    return quote.serviceRequested || 'No service specified';
  };

  // Search filtering
  const filteredQuotes = useMemo(() => {
    if (!searchQuery.trim()) return quotes;
    const query = searchQuery.toLowerCase();
    return quotes.filter(quote =>
      (quote.customer?.name || '').toLowerCase().includes(query) ||
      (quote.vehicle?.year + ' ' + quote.vehicle?.make + ' ' + quote.vehicle?.model || '').toLowerCase().includes(query) ||
      (quote.serviceRequested || '').toLowerCase().includes(query) ||
      (quote.services || []).some(s => s.description.toLowerCase().includes(query))
    );
  }, [quotes, searchQuery]);

  // Sorting
  const sortedQuotes = useMemo(() => {
    const sorted = [...filteredQuotes];
    sorted.sort((a, b) => {
      for (const { key, direction } of sortConfig) {
        let comparison = 0;
        const multiplier = direction === 'asc' ? 1 : -1;

        switch (key) {
          case 'date':
            comparison = new Date(a.date) - new Date(b.date);
            break;
          case 'customer':
            comparison = (a.customer?.name || '').localeCompare(b.customer?.name || '');
            break;
          case 'service':
            const serviceA = a.services?.[0]?.description || a.serviceRequested || '';
            const serviceB = b.services?.[0]?.description || b.serviceRequested || '';
            comparison = serviceA.localeCompare(serviceB);
            break;
          case 'amount':
            comparison = (a.totalEstimate || 0) - (b.totalEstimate || 0);
            break;
          case 'status':
          case 'age': // legacy sort key kept so users with old persisted state still sort correctly
            comparison = getLastContactDate(a) - getLastContactDate(b);
            break;
          default:
            break;
        }

        if (comparison !== 0) return comparison * multiplier;
      }
      return 0;
    });
    return sorted;
  }, [filteredQuotes, sortConfig]);

  // 3-state cycle per column: ascending → descending → off (removed from sort).
  // Up to 3 active sort keys; adding a 4th drops the oldest.
  const handleSort = (key) => {
    setSortConfig(prev => {
      const existing = prev.find(s => s.key === key);
      if (existing) {
        if (existing.direction === 'asc') {
          return prev.map(s => s.key === key ? { ...s, direction: 'desc' } : s);
        }
        return prev.filter(s => s.key !== key);
      }
      const newConfig = [...prev, { key, direction: 'asc' }];
      return newConfig.length > 3 ? newConfig.slice(1) : newConfig;
    });
  };

  const getSortIndicator = (key) => {
    const config = sortConfig.find(s => s.key === key);
    if (!config) return '';
    const arrow = config.direction === 'asc' ? ' \u25B2' : ' \u25BC';
    const priority = sortConfig.length > 1 ? ` ${sortConfig.indexOf(config) + 1}` : '';
    return arrow + priority;
  };

  const handleApprove = async (quoteId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Approve this quote and convert to a work order?')) return;

    try {
      setConverting(quoteId);
      const response = await QuoteService.convertToWorkOrder(quoteId);
      navigate(`/work-orders/${response.data.workOrder._id}`);
    } catch (err) {
      console.error('Error converting quote:', err);
      setError('Failed to convert quote to work order.');
      setConverting(null);
    }
  };

  const handleOpenCloseModal = (quote, e) => {
    if (e) e.stopPropagation();
    // Default to "Archived (no response)" if the quote has already aged past the prompt,
    // otherwise default to "Declined" — the typical reason someone clicks Close mid-cycle.
    const defaultChoice = getStatusBadge(quote).label === 'Archive?' ? 'archived' : 'declined';
    setCloseModal({ quote, choice: defaultChoice });
  };

  const handleConfirmClose = async () => {
    if (!closeModal) return;
    const { quote, choice } = closeModal;
    const quoteId = quote._id;
    const newDbStatus = choice === 'declined' ? 'Quote - Declined' : 'Quote - Archived';
    const apiCall = choice === 'declined' ? QuoteService.declineQuote : QuoteService.archiveQuote;

    try {
      setActionInFlight(quoteId);
      await apiCall(quoteId);
      if (showArchived) {
        setQuotes(prev => prev.map(q =>
          q._id === quoteId ? { ...q, status: newDbStatus } : q
        ));
      } else {
        setQuotes(prev => prev.filter(q => q._id !== quoteId));
      }
      setCloseModal(null);
    } catch (err) {
      console.error('Error closing quote:', err);
      setError(choice === 'declined' ? 'Failed to mark quote as declined.' : 'Failed to archive quote.');
    } finally {
      setActionInFlight(null);
    }
  };

  const handleDeleteQuote = async (quoteId) => {
    try {
      await QuoteService.deleteQuote(quoteId);
      setQuotes(prev => prev.filter(q => q._id !== quoteId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting quote:', err);
      setError('Failed to delete quote.');
      setDeleteConfirm(null);
    }
  };

  // Communications checkboxes — optimistic update, revert on failure.
  // Each field requires the prior one to be checked; unchecking a prior cascades to dependents.
  const handleToggleCommunication = async (quote, field, e) => {
    if (e) e.stopPropagation();
    const fieldToFlag = {
      sentAt: 'sent',
      followedUpAt: 'followedUp',
      secondFollowedUpAt: 'secondFollowedUp'
    };
    const currentlyChecked = !!quote.quoteCommunications?.[field];
    const newChecked = !currentlyChecked;
    const nowIso = new Date().toISOString();

    // Build new local comms state with cascade-uncheck rules
    const currentComms = quote.quoteCommunications || {};
    const newComms = { ...currentComms };
    if (newChecked) {
      newComms[field] = nowIso;
    } else {
      newComms[field] = null;
      if (field === 'sentAt') {
        newComms.followedUpAt = null;
        newComms.secondFollowedUpAt = null;
      } else if (field === 'followedUpAt') {
        newComms.secondFollowedUpAt = null;
      }
    }

    setQuotes(prev => prev.map(q =>
      q._id === quote._id ? { ...q, quoteCommunications: newComms } : q
    ));

    // Mirror the cascade in the API payload so the server stays consistent.
    const payload = { [fieldToFlag[field]]: newChecked };
    if (!newChecked) {
      if (field === 'sentAt') {
        payload.followedUp = false;
        payload.secondFollowedUp = false;
      } else if (field === 'followedUpAt') {
        payload.secondFollowedUp = false;
      }
    }

    try {
      await QuoteService.updateCommunications(quote._id, payload);
    } catch (err) {
      console.error('Error updating quote communications:', err);
      setError('Failed to update communications.');
      fetchQuotes();
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-48">
        <p>Loading quotes...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Quotes</h1>
        <Button to="/quotes/new" variant="primary">
          <i className="fas fa-plus mr-2"></i>New Quote
        </Button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">&times;</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-1">
          <Input
            placeholder="Search quotes by customer, vehicle, or service..."
            value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
              showArchived
                ? 'bg-gray-200 border-gray-400 text-gray-800'
                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <i className="fas fa-archive mr-1"></i>
            {showArchived ? 'Showing Archived' : 'Show Archived'}
          </button>
        </div>
      </div>

      <Card>
        {sortedQuotes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery ? 'No quotes match your search.' : 'No quotes yet. Create your first quote!'}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('date')}
                    >
                      Date{getSortIndicator('date')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('customer')}
                    >
                      Customer & Vehicle{getSortIndicator('customer')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('service')}
                    >
                      Service{getSortIndicator('service')}
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('amount')}
                    >
                      Estimate{getSortIndicator('amount')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Communications
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('status')}
                    >
                      Status{getSortIndicator('status')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedQuotes.map((quote) => {
                    const terminal = isTerminal(quote);
                    const status = getStatusBadge(quote);
                    const comms = quote.quoteCommunications || {};
                    const commsRows = [
                      { field: 'sentAt', label: 'Sent', value: comms.sentAt, disabled: false },
                      { field: 'followedUpAt', label: 'Followed up', value: comms.followedUpAt, disabled: !comms.sentAt },
                      { field: 'secondFollowedUpAt', label: '2nd follow-up', value: comms.secondFollowedUpAt, disabled: !comms.followedUpAt }
                    ];
                    const declining = actionInFlight === quote._id;
                    return (
                    <tr
                      key={quote._id}
                      className={`cursor-pointer ${terminal ? 'bg-gray-50 opacity-60 hover:opacity-80' : 'hover:bg-gray-50'}`}
                      onClick={() => navigate(`/quotes/${quote._id}`)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(quote.date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {quote.customer?.name || 'Unknown Customer'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {quote.vehicle
                            ? `${quote.vehicle.year} ${quote.vehicle.make} ${quote.vehicle.model}`
                            : 'No Vehicle'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {getServiceDisplay(quote)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                        {formatCurrency(quote.totalEstimate)}
                      </td>
                      <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col space-y-1">
                          {commsRows.map(row => (
                            <label
                              key={row.field}
                              className={`inline-flex items-center text-xs select-none ${row.disabled ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 cursor-pointer'}`}
                              title={
                                row.disabled
                                  ? (row.field === 'followedUpAt' ? 'Mark Sent first' : 'Mark Followed up first')
                                  : row.value
                                    ? `${row.label} on ${formatDateTime(row.value)}`
                                    : `Not ${row.label.toLowerCase()} yet`
                              }
                            >
                              <input
                                type="checkbox"
                                checked={!!row.value}
                                disabled={row.disabled}
                                onChange={(e) => handleToggleCommunication(quote, row.field, e)}
                                className={`h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 ${row.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                              />
                              <span className="ml-1.5 whitespace-nowrap">{row.label}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                          {status.icon && <i className={`fas ${status.icon} mr-1`}></i>}
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                        <div className="flex justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
                          {!terminal && (
                            <>
                              <Button
                                variant="success"
                                size="sm"
                                onClick={(e) => handleApprove(quote._id, e)}
                                disabled={converting === quote._id || declining}
                                title="Approve and convert to work order"
                              >
                                {converting === quote._id ? (
                                  <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                  <><i className="fas fa-check mr-1"></i>Approve</>
                                )}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={(e) => handleOpenCloseModal(quote, e)}
                                disabled={converting === quote._id || declining}
                                title="Close this quote (declined or archived)"
                              >
                                {declining ? (
                                  <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                  <><i className="fas fa-times-circle mr-1"></i>Close</>
                                )}
                              </Button>
                            </>
                          )}
                          <Button
                            to={`/quotes/${quote._id}`}
                            variant="outline"
                            size="sm"
                          >
                            View
                          </Button>
                          <Button
                            to={`/quotes/${quote._id}/edit`}
                            variant="outline"
                            size="sm"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="light"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(quote._id); }}
                            title="Delete quote"
                          >
                            <i className="fas fa-trash text-red-600"></i>
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <MobileContainer>
              {sortedQuotes.map((quote) => {
                const terminal = isTerminal(quote);
                const status = getStatusBadge(quote);
                const comms = quote.quoteCommunications || {};
                const commsRows = [
                  { field: 'sentAt', label: 'Sent', value: comms.sentAt, disabled: false },
                  { field: 'followedUpAt', label: 'Followed up', value: comms.followedUpAt, disabled: !comms.sentAt },
                  { field: 'secondFollowedUpAt', label: '2nd follow-up', value: comms.secondFollowedUpAt, disabled: !comms.followedUpAt }
                ];
                const declining = actionInFlight === quote._id;
                return (
                <MobileCard key={quote._id} onClick={() => navigate(`/quotes/${quote._id}`)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <MobileSection label="Customer">
                        <div className="font-medium">{quote.customer?.name || 'Unknown Customer'}</div>
                        {quote.vehicle ? (
                          <div className="text-xs text-gray-500 mt-1">
                            {quote.vehicle.year} {quote.vehicle.make} {quote.vehicle.model}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 mt-1">No Vehicle</div>
                        )}
                      </MobileSection>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-xs text-gray-500 mb-1">
                        {formatDate(quote.date)}
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                        {status.icon && <i className={`fas ${status.icon} mr-1`}></i>}
                        {status.label}
                      </span>
                    </div>
                  </div>

                  <MobileSection label="Service">
                    <div className="text-sm">{getServiceDisplay(quote)}</div>
                  </MobileSection>

                  <MobileSection label="Communications">
                    <div className="flex flex-col space-y-1" onClick={(e) => e.stopPropagation()}>
                      {commsRows.map(row => (
                        <label
                          key={row.field}
                          className={`inline-flex items-center text-xs select-none ${row.disabled ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 cursor-pointer'}`}
                          title={
                            row.disabled
                              ? (row.field === 'followedUpAt' ? 'Mark Sent first' : 'Mark Followed up first')
                              : row.value
                                ? `${row.label} on ${formatDateTime(row.value)}`
                                : `Not ${row.label.toLowerCase()} yet`
                          }
                        >
                          <input
                            type="checkbox"
                            checked={!!row.value}
                            disabled={row.disabled}
                            onChange={(e) => handleToggleCommunication(quote, row.field, e)}
                            className={`h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 ${row.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                          />
                          <span className="ml-1.5">{row.label}</span>
                        </label>
                      ))}
                    </div>
                  </MobileSection>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(quote.totalEstimate)}
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                      {!terminal && (
                        <>
                          <Button
                            variant="success"
                            size="sm"
                            onClick={(e) => handleApprove(quote._id, e)}
                            disabled={converting === quote._id || declining}
                          >
                            {converting === quote._id ? <i className="fas fa-spinner fa-spin"></i> : (<><i className="fas fa-check mr-1"></i>Approve</>)}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={(e) => handleOpenCloseModal(quote, e)}
                            disabled={converting === quote._id || declining}
                          >
                            {declining ? <i className="fas fa-spinner fa-spin"></i> : (<><i className="fas fa-times-circle mr-1"></i>Close</>)}
                          </Button>
                        </>
                      )}
                      <Button to={`/quotes/${quote._id}/edit`} variant="outline" size="sm">Edit</Button>
                      <Button
                        variant="light"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(quote._id); }}
                      >
                        <i className="fas fa-trash text-red-600"></i>
                      </Button>
                    </div>
                  </div>
                </MobileCard>
                );
              })}
            </MobileContainer>
          </>
        )}
      </Card>

      {/* Close Quote Modal — pick declined vs no-response/archive */}
      {closeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setCloseModal(null)}>
          <div className="bg-white rounded-lg p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Close Quote</h3>
            <p className="text-sm text-gray-600 mb-4">
              How is this quote closing?
            </p>
            <div className="space-y-2 mb-5">
              <label className={`flex items-start p-3 border rounded-md cursor-pointer ${closeModal.choice === 'declined' ? 'border-red-400 bg-red-50' : 'border-gray-300 hover:bg-gray-50'}`}>
                <input
                  type="radio"
                  name="closeChoice"
                  value="declined"
                  checked={closeModal.choice === 'declined'}
                  onChange={() => setCloseModal({ ...closeModal, choice: 'declined' })}
                  className="mt-1 mr-3"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    <i className="fas fa-ban text-red-600 mr-1"></i>Customer Declined
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    The customer told us they don't want to move forward.
                  </div>
                </div>
              </label>
              <label className={`flex items-start p-3 border rounded-md cursor-pointer ${closeModal.choice === 'archived' ? 'border-gray-500 bg-gray-100' : 'border-gray-300 hover:bg-gray-50'}`}>
                <input
                  type="radio"
                  name="closeChoice"
                  value="archived"
                  checked={closeModal.choice === 'archived'}
                  onChange={() => setCloseModal({ ...closeModal, choice: 'archived' })}
                  className="mt-1 mr-3"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    <i className="fas fa-archive text-gray-600 mr-1"></i>No Response — Archive
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Quote aged out without a decision from the customer.
                  </div>
                </div>
              </label>
            </div>
            <div className="flex justify-end space-x-3">
              <Button variant="light" onClick={() => setCloseModal(null)} disabled={actionInFlight === closeModal.quote._id}>Cancel</Button>
              <Button variant="danger" onClick={handleConfirmClose} disabled={actionInFlight === closeModal.quote._id}>
                {actionInFlight === closeModal.quote._id ? (
                  <><i className="fas fa-spinner fa-spin mr-1"></i>Closing...</>
                ) : (
                  'Close Quote'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Quote?</h3>
            <p className="text-gray-600 mb-4">This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <Button variant="light" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => handleDeleteQuote(deleteConfirm)}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteList;
