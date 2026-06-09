import React, { useState, useEffect } from 'react';
import Button from './Button';
import CustomerService from '../../services/customerService';
import WorkOrderService from '../../services/workOrderService';
import QuoteService from '../../services/quoteService';
import { formatDate } from '../../utils/formatters';

const TAB_VEHICLES = 'vehicles';
const TAB_WORK_ORDERS = 'workorders';
const TAB_QUOTES = 'quotes';

const RelatedRecordsTabs = ({ customerId, vehicleId }) => {
  const [vehicles, setVehicles] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_WORK_ORDERS);
  const [expanded, setExpanded] = useState({
    [TAB_VEHICLES]: false,
    [TAB_WORK_ORDERS]: false,
    [TAB_QUOTES]: false,
  });

  const showVehiclesTab = !!customerId && !vehicleId;

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        setError(null);
        const filter = vehicleId ? { vehicle: vehicleId } : { customer: customerId };

        const tasks = [
          WorkOrderService.getAllWorkOrders(filter).then(r => r.data.workOrders || []),
          QuoteService.getAllQuotes({ ...filter, includeArchived: true }).then(r => r.data.quotes || []),
        ];
        if (showVehiclesTab) {
          tasks.push(CustomerService.getCustomerVehicles(customerId).then(r => r.data.vehicles || []));
        }

        const [wos, qts, vhs] = await Promise.all(tasks);
        setWorkOrders(wos);
        setQuotes(qts);
        if (showVehiclesTab) setVehicles(vhs);
      } catch (err) {
        console.error('Error loading related records:', err);
        setError('Failed to load related records.');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [customerId, vehicleId, showVehiclesTab]);

  const toggleExpanded = (tab) => {
    setExpanded(prev => ({ ...prev, [tab]: !prev[tab] }));
  };

  const tabs = [
    showVehiclesTab && { key: TAB_VEHICLES, label: 'Vehicles', count: vehicles.length },
    { key: TAB_WORK_ORDERS, label: 'Work Orders', count: workOrders.length },
    { key: TAB_QUOTES, label: 'Quotes', count: quotes.length },
  ].filter(Boolean);

  const newLinkByTab = {
    [TAB_VEHICLES]: `/vehicles/new?customer=${customerId}`,
    [TAB_WORK_ORDERS]: vehicleId
      ? `/work-orders/new?vehicle=${vehicleId}${customerId ? `&customer=${customerId}` : ''}`
      : `/work-orders/new?customer=${customerId}`,
    [TAB_QUOTES]: vehicleId
      ? `/quotes/new?vehicle=${vehicleId}${customerId ? `&customer=${customerId}` : ''}`
      : `/quotes/new?customer=${customerId}`,
  };

  const newButtonLabelByTab = {
    [TAB_VEHICLES]: 'Add Vehicle',
    [TAB_WORK_ORDERS]: 'New Work Order',
    [TAB_QUOTES]: 'New Quote',
  };

  const renderVehicleRow = (vehicle) => (
    <div key={vehicle._id} className="py-3 flex justify-between items-center">
      <div>
        <p className="font-medium">{vehicle.year} {vehicle.make} {vehicle.model}</p>
        <p className="text-sm text-gray-600">
          {vehicle.vin ? `VIN: ${vehicle.vin}` : 'No VIN'}
          {vehicle.licensePlate ? ` • License: ${vehicle.licensePlate}` : ''}
        </p>
      </div>
      <Button to={`/vehicles/${vehicle._id}`} variant="outline" size="sm">View</Button>
    </div>
  );

  const workOrderStatusClass = (status) => {
    if (status?.includes('Completed')) return 'bg-green-100 text-green-800';
    if (status === 'Cancelled') return 'bg-red-100 text-red-800';
    return 'bg-blue-100 text-blue-800';
  };

  const renderWorkOrderRow = (wo) => (
    <div key={wo._id} className="py-3 flex justify-between items-center gap-3">
      <div className="min-w-0 flex-1">
        {vehicleId ? (
          <>
            <p className="font-medium truncate">{wo.serviceRequested}</p>
            <p className="text-sm text-gray-600">{formatDate(wo.date)}</p>
          </>
        ) : (
          <>
            <p className="font-medium truncate">
              {wo.vehicle?.year} {wo.vehicle?.make} {wo.vehicle?.model}
            </p>
            <p className="text-sm text-gray-600 truncate">
              {wo.serviceRequested} · {formatDate(wo.date)}
            </p>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`inline-block px-2 py-1 text-xs rounded-full whitespace-nowrap ${workOrderStatusClass(wo.status)}`}>
          {wo.status}
        </span>
        <Button to={`/work-orders/${wo._id}`} variant="outline" size="sm">View</Button>
      </div>
    </div>
  );

  const quoteStatusInfo = (status) => {
    if (status === 'Quote - Declined') return { label: 'Declined', className: 'bg-red-100 text-red-800' };
    if (status === 'Quote - Archived') return { label: 'Archived', className: 'bg-gray-100 text-gray-600' };
    return { label: 'Open', className: 'bg-blue-100 text-blue-800' };
  };

  const renderQuoteRow = (quote) => {
    const badge = quoteStatusInfo(quote.status);
    return (
      <div key={quote._id} className="py-3 flex justify-between items-center gap-3">
        <div className="min-w-0 flex-1">
          {vehicleId ? (
            <>
              <p className="font-medium truncate">{quote.serviceRequested}</p>
              <p className="text-sm text-gray-600">{formatDate(quote.date)}</p>
            </>
          ) : (
            <>
              <p className="font-medium truncate">
                {quote.vehicle?.year} {quote.vehicle?.make} {quote.vehicle?.model}
              </p>
              <p className="text-sm text-gray-600 truncate">
                {quote.serviceRequested} · {formatDate(quote.date)}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-block px-2 py-1 text-xs rounded-full whitespace-nowrap ${badge.className}`}>
            {badge.label}
          </span>
          <Button to={`/quotes/${quote._id}`} variant="outline" size="sm">View</Button>
        </div>
      </div>
    );
  };

  const renderTabBody = () => {
    if (loading) {
      return <div className="text-center py-6 text-gray-500">Loading...</div>;
    }
    if (error) {
      return <div className="text-center py-6 text-red-600">{error}</div>;
    }

    const config = {
      [TAB_VEHICLES]: {
        items: vehicles,
        emptyText: 'No vehicles found for this customer.',
        renderRow: renderVehicleRow,
        noun: 'vehicle',
      },
      [TAB_WORK_ORDERS]: {
        items: workOrders,
        emptyText: vehicleId ? 'No work orders found for this vehicle.' : 'No work orders found for this customer.',
        renderRow: renderWorkOrderRow,
        noun: 'work order',
      },
      [TAB_QUOTES]: {
        items: quotes,
        emptyText: vehicleId ? 'No quotes found for this vehicle.' : 'No quotes found for this customer.',
        renderRow: renderQuoteRow,
        noun: 'quote',
      },
    }[activeTab];

    if (!config.items.length) {
      return <div className="text-center py-6 text-gray-500"><p>{config.emptyText}</p></div>;
    }

    const isExpanded = expanded[activeTab];
    const visible = isExpanded ? config.items : config.items.slice(0, 5);
    const overflow = config.items.length - 5;

    return (
      <>
        <div className="divide-y divide-gray-200">
          {visible.map(config.renderRow)}
        </div>
        {overflow > 0 && (
          <div className="pt-3 text-center">
            <Button onClick={() => toggleExpanded(activeTab)} variant="link">
              {isExpanded ? 'Show less' : `View ${overflow} more ${config.noun}${overflow > 1 ? 's' : ''}`}
            </Button>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center flex-wrap gap-2">
        <div className="flex space-x-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary-100 text-primary-800'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label} <span className="text-xs text-gray-500">({tab.count})</span>
            </button>
          ))}
        </div>
        <Button to={newLinkByTab[activeTab]} variant="outline" size="sm">
          {newButtonLabelByTab[activeTab]}
        </Button>
      </div>
      <div className="p-4">
        {renderTabBody()}
      </div>
    </div>
  );
};

export default RelatedRecordsTabs;
