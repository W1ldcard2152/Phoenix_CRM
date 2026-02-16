import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import { MobileCard, MobileSection, MobileContainer } from '../../components/common/ResponsiveTable';
import QuoteService from '../../services/quoteService';
import { formatCurrency } from '../../utils/formatters';

const QuoteList = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState([{ key: 'date', direction: 'desc' }]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [converting, setConverting] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

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

  // Age calculation and follow-up stages
  const getQuoteDays = (date) => Math.floor((new Date() - new Date(date)) / (1000 * 60 * 60 * 24));

  const getQuoteAge = (date) => {
    const days = getQuoteDays(date);
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  const getFollowUpStage = (date) => {
    const days = getQuoteDays(date);
    if (days <= 7) return { label: getQuoteAge(date), badge: 'bg-green-100 text-green-800', icon: null };
    if (days <= 14) return { label: 'Follow up', badge: 'bg-blue-100 text-blue-800', icon: 'fa-phone' };
    if (days <= 30) return { label: 'Follow up', badge: 'bg-yellow-100 text-yellow-800', icon: 'fa-phone' };
    if (days <= 60) return { label: 'Needs attention', badge: 'bg-orange-100 text-orange-800', icon: 'fa-exclamation-triangle' };
    return { label: 'Archive?', badge: 'bg-red-100 text-red-800', icon: 'fa-archive' };
  };

  const getAgeColor = (date) => {
    const days = getQuoteDays(date);
    if (days <= 7) return 'text-green-600';
    if (days <= 14) return 'text-blue-600';
    if (days <= 30) return 'text-yellow-600';
    if (days <= 60) return 'text-orange-600';
    return 'text-red-600';
  };

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
          case 'vehicle':
            const vehicleA = `${a.vehicle?.year || ''} ${a.vehicle?.make || ''} ${a.vehicle?.model || ''}`;
            const vehicleB = `${b.vehicle?.year || ''} ${b.vehicle?.make || ''} ${b.vehicle?.model || ''}`;
            comparison = vehicleA.localeCompare(vehicleB);
            break;
          case 'service':
            const serviceA = a.services?.[0]?.description || a.serviceRequested || '';
            const serviceB = b.services?.[0]?.description || b.serviceRequested || '';
            comparison = serviceA.localeCompare(serviceB);
            break;
          case 'amount':
            comparison = (a.totalEstimate || 0) - (b.totalEstimate || 0);
            break;
          case 'age':
            comparison = new Date(a.date) - new Date(b.date);
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

  const handleSort = (key) => {
    setSortConfig(prev => {
      const existing = prev.find(s => s.key === key);
      if (existing) {
        return prev.map(s =>
          s.key === key ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' } : s
        );
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

  const handleConvertToWorkOrder = async (quoteId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Convert this quote to an active work order?')) return;

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

  const handleDeleteQuote = async (quoteId) => {
    try {
      await QuoteService.deleteQuote(quoteId);
      setQuotes(prev => prev.filter(q => q._id !== quoteId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting quote:', err);
      setError('Failed to delete quote.');
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
                      Customer{getSortIndicator('customer')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('vehicle')}
                    >
                      Vehicle{getSortIndicator('vehicle')}
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
                    <th
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('age')}
                    >
                      Age{getSortIndicator('age')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedQuotes.map((quote) => {
                    const isArchived = quote.status === 'Quote - Archived';
                    const stage = getFollowUpStage(quote.date);
                    return (
                    <tr
                      key={quote._id}
                      className={`cursor-pointer ${isArchived ? 'bg-gray-50 opacity-60 hover:opacity-80' : 'hover:bg-gray-50'}`}
                      onClick={() => navigate(`/quotes/${quote._id}`)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {new Date(quote.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {quote.customer?.name || 'Unknown Customer'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {quote.vehicle
                          ? `${quote.vehicle.year} ${quote.vehicle.make} ${quote.vehicle.model}`
                          : 'No Vehicle'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {getServiceDisplay(quote)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                        {formatCurrency(quote.totalEstimate)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {isArchived ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            <i className="fas fa-archive mr-1"></i>Archived
                          </span>
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stage.badge}`}>
                            {stage.icon && <i className={`fas ${stage.icon} mr-1`}></i>}
                            {stage.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                        <div className="flex justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
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
                            variant="primary"
                            size="sm"
                            onClick={(e) => handleConvertToWorkOrder(quote._id, e)}
                            disabled={converting === quote._id}
                          >
                            {converting === quote._id ? (
                              <i className="fas fa-spinner fa-spin"></i>
                            ) : (
                              <>
                                <i className="fas fa-arrow-right mr-1"></i>WO
                              </>
                            )}
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
                const isArchived = quote.status === 'Quote - Archived';
                const stage = getFollowUpStage(quote.date);
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
                        {new Date(quote.date).toLocaleDateString()}
                      </div>
                      {isArchived ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Archived
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800`}>
                          Quote
                        </span>
                      )}
                    </div>
                  </div>

                  <MobileSection label="Service">
                    <div className="text-sm">{getServiceDisplay(quote)}</div>
                  </MobileSection>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(quote.totalEstimate)}
                      </div>
                      {isArchived ? (
                        <div className="text-xs text-gray-500">Archived</div>
                      ) : (
                        <div className={`text-xs ${getAgeColor(quote.date)}`}>
                          {stage.icon && <i className={`fas ${stage.icon} mr-1`}></i>}
                          {stage.label}
                        </div>
                      )}
                    </div>
                    <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        to={`/quotes/${quote._id}/edit`}
                        variant="outline"
                        size="sm"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={(e) => handleConvertToWorkOrder(quote._id, e)}
                        disabled={converting === quote._id}
                      >
                        {converting === quote._id ? (
                          <i className="fas fa-spinner fa-spin"></i>
                        ) : (
                          <>
                            <i className="fas fa-arrow-right mr-1"></i>WO
                          </>
                        )}
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
