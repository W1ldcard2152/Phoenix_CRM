import React from 'react';
import { formatCurrency } from '../../utils/formatters';

// Renders job-grouped line items for quotes / work orders / invoices.
// Each group is a "job" (a requested service, a service package, or the
// General bucket) with its packages, parts, labor, and a per-job total.
//
// `groups` is the normalized shape produced by the caller:
//   {
//     key, name, total,
//     packages: [{ key, name, price, includedItems: [{ quantity, unit, brand, name, partNumber }] }],
//     parts: [{ key, description, partNumber, quantity, unitPrice, lineTotal,
//               warranty, coreCharge, coreChargeInvoiceable }],
//     labor: [{ key, description, quantity, rate, billingType, lineTotal }],
//     notes: [{ _id, content }]   // customer-facing notes filed against this job
//   }
//
// All job tables share the same fixed column widths so amounts line up across
// containers (Qty / Unit / Amount right-aligned).
const includedItemLabel = (item) => {
  const qty = item.quantity || 0;
  const unit = item.unit ? ` ${item.unit}` : '';
  const brand = item.brand ? `${item.brand} ` : '';
  const partNum = item.partNumber ? ` (${item.partNumber})` : '';
  return `${qty}${unit} - ${brand}${item.name}${partNum}`;
};

const JobGroups = ({ groups = [] }) => {
  if (!groups.length) return null;

  const sectionRow = (label) => (
    <tr>
      <td colSpan={4} className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</td>
    </tr>
  );

  return (
    <div className="mb-6 space-y-8">
      {groups.map((group) => {
        const packages = group.packages || [];
        const hasParts = group.parts && group.parts.length > 0;
        const hasLabor = group.labor && group.labor.length > 0;
        // A lone package keeps its compact look: included items, then the total.
        // Beside other lines it needs a priced row, or the total wouldn't add up.
        const soloPackage = packages.length === 1 && !hasParts && !hasLabor ? packages[0] : null;
        const hasPackageRows = packages.length > 0 && !soloPackage;
        const hasTable = hasParts || hasLabor || hasPackageRows;
        return (
          <div key={group.key} className="border border-gray-300 rounded-md overflow-hidden shadow-sm">
            {/* Job heading */}
            <div className="bg-gray-100 px-3 py-2 border-b border-gray-300">
              <h3 className="font-semibold text-md text-gray-800">{group.name}</h3>
            </div>

            {/* Service package included items */}
            {soloPackage && soloPackage.includedItems.length > 0 && (
              <ul className="list-disc list-inside text-xs text-gray-600 px-3 py-2">
                {soloPackage.includedItems.map((item, i) => <li key={i}>{includedItemLabel(item)}</li>)}
              </ul>
            )}

            {hasTable && (
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col />
                  <col className="w-16" />
                  <col className="w-28" />
                  <col className="w-24" />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-1 text-left font-medium"></th>
                    <th className="px-3 py-1 text-right font-medium">Qty</th>
                    <th className="px-3 py-1 text-right font-medium">Unit Price</th>
                    <th className="px-3 py-1 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {hasPackageRows && (
                    <>
                      {sectionRow('Service')}
                      {packages.map((pkg) => (
                        <tr key={pkg.key} className="border-t border-gray-100">
                          <td className="px-3 py-1 align-top">
                            {pkg.name}
                            {pkg.includedItems.map((item, i) => (
                              <div key={i} className="text-xs text-gray-500">{includedItemLabel(item)}</div>
                            ))}
                          </td>
                          <td className="px-3 py-1 text-right text-gray-600 align-top">1</td>
                          <td className="px-3 py-1 text-right text-gray-600 align-top">{formatCurrency(pkg.price)}</td>
                          <td className="px-3 py-1 text-right align-top whitespace-nowrap">{formatCurrency(pkg.price)}</td>
                        </tr>
                      ))}
                    </>
                  )}

                  {hasParts && (
                    <>
                      {sectionRow('Parts')}
                      {group.parts.map((part) => (
                        <React.Fragment key={part.key}>
                          <tr className="border-t border-gray-100">
                            <td className="px-3 py-1 align-top">
                              {part.description}
                              {part.partNumber ? <span className="text-gray-500"> ({part.partNumber})</span> : null}
                              {part.warranty ? (
                                <div className="text-xs text-gray-500 italic">Part Warranty: {part.warranty}</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-1 text-right text-gray-600 align-top">{part.quantity}</td>
                            <td className="px-3 py-1 text-right text-gray-600 align-top">{formatCurrency(part.unitPrice)}</td>
                            <td className="px-3 py-1 text-right align-top whitespace-nowrap">{formatCurrency(part.lineTotal)}</td>
                          </tr>
                          {part.coreChargeInvoiceable && part.coreCharge > 0 && (
                            <tr className="text-xs text-gray-500">
                              <td className="px-3 py-0.5 pl-6">Core Charge - {part.description}</td>
                              <td></td>
                              <td></td>
                              <td className="px-3 py-0.5 text-right whitespace-nowrap">{formatCurrency(part.coreCharge)}</td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </>
                  )}

                  {hasLabor && (
                    <>
                      {sectionRow('Labor')}
                      {group.labor.map((item) => {
                        const isHourly = item.billingType !== 'fixed';
                        return (
                          <tr key={item.key} className="border-t border-gray-100">
                            <td className="px-3 py-1 align-top">{item.description}</td>
                            <td className="px-3 py-1 text-right text-gray-600 align-top whitespace-nowrap">
                              {item.quantity}{isHourly ? ' hr' : ' ea'}
                            </td>
                            <td className="px-3 py-1 text-right text-gray-600 align-top whitespace-nowrap">
                              {formatCurrency(item.rate)}{isHourly ? '/hr' : '/ea'}
                            </td>
                            <td className="px-3 py-1 text-right align-top whitespace-nowrap">{formatCurrency(item.lineTotal)}</td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-semibold text-gray-900">
                    <td className="px-3 py-1.5">Total</td>
                    <td></td>
                    <td></td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCurrency(group.total)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Package-only groups (no line table) still show a Total line */}
            {!hasTable && (
              <div className="flex justify-between items-center border-t-2 border-gray-300 px-3 py-1.5 font-semibold text-gray-900">
                <span>Total</span>
                <span className="whitespace-nowrap">{formatCurrency(group.total)}</span>
              </div>
            )}

            {/* Customer-facing notes written against this job */}
            {group.notes && group.notes.length > 0 && (
              <div className="border-t border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Notes</div>
                <ul className="space-y-1 text-xs text-gray-700">
                  {group.notes.map((note, i) => (
                    <li key={note._id || i} style={{ whiteSpace: 'pre-line' }}>{note.content}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default JobGroups;
