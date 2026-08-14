import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import ResponsiveTable, { MobileCard, MobileContainer } from '../../components/common/ResponsiveTable';
import CountScopeBuilder from '../../components/supplies/CountScopeBuilder';
import SupplyCountService from '../../services/supplyCountService';
import SupplyService from '../../services/supplyService';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Cycle counts: what's open, what's been posted, and what can be re-run.
 *
 * Saved scopes sit alongside the counts rather than behind a settings screen,
 * because the question "what should I count today?" and the answer "the fluids
 * sweep, like last month" belong on the same page.
 */
const STATUS_STYLES = {
  counting: 'bg-blue-50 text-blue-700 border-blue-200',
  review: 'bg-amber-50 text-amber-800 border-amber-200',
  posted: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200'
};

const STATUS_LABELS = {
  counting: 'Counting',
  review: 'In review',
  posted: 'Posted',
  cancelled: 'Cancelled'
};

const CountList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = ['admin', 'management'].includes(user?.role);

  const [counts, setCounts] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [tags, setTags] = useState([]);
  const [vocab, setVocab] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [countRes, scopeRes] = await Promise.all([
        SupplyCountService.list(),
        SupplyCountService.listScopes()
      ]);
      setCounts(countRes.data.counts);
      setScopes(scopeRes.data.scopes);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load counts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Reference data for the scope builder. Fetched once here so opening the
  // builder is instant rather than showing empty dropdowns while it loads.
  useEffect(() => {
    Promise.all([SupplyService.getTags(), SupplyService.getVocab(), SupplyService.getFields()])
      .then(([tagRes, vocabRes, fieldRes]) => {
        setTags(tagRes.data.tags);
        setVocab(vocabRes.data.vocab);
        setFields(fieldRes.data.fields);
      })
      .catch(() => setError('Could not load tags and vocabulary.'));
  }, []);

  const runScope = async (scope) => {
    setBusy(true);
    try {
      const res = await SupplyCountService.runScope(scope._id);
      navigate(`/supplies/counts/${res.data.count._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start that count.');
      setBusy(false);
    }
  };

  const deleteScope = async (scope) => {
    if (!window.confirm(`Delete the saved scope "${scope.name}"?`)) return;
    try {
      await SupplyCountService.deleteScope(scope._id);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete that scope.');
    }
  };

  const deleteCount = async (count) => {
    if (!window.confirm('Delete this count? Nothing has been posted from it.')) return;
    try {
      await SupplyCountService.remove(count._id);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete that count.');
    }
  };

  const open = counts.filter((c) => c.status === 'counting' || c.status === 'review');
  const done = counts.filter((c) => c.status === 'posted' || c.status === 'cancelled');

  const Badge = ({ status }) => (
    <span className={`inline-flex px-2 py-0.5 text-[11px] rounded border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );

  const renderRows = (rows) => rows.map((c) => (
    <tr
      key={String(c._id)}
      onClick={() => navigate(`/supplies/counts/${c._id}`)}
      className="cursor-pointer hover:bg-gray-50"
    >
      <td className="px-4 py-2">
        <div className="text-sm font-medium text-gray-900">{c.name || 'Cycle count'}</div>
        <div className="text-xs text-gray-400">
          {new Date(c.createdAt).toLocaleDateString()}
          {c.createdBy?.displayName || c.createdBy?.name
            ? ` · ${c.createdBy.displayName || c.createdBy.name}`
            : ''}
        </div>
      </td>
      <td className="px-4 py-2"><Badge status={c.status} /></td>
      <td className="px-4 py-2 text-sm text-gray-600">
        {c.progress.done} of {c.progress.total}
        {c.progress.total > 0 && (
          <div className="mt-1 h-1.5 w-24 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-primary-400"
              style={{ width: `${Math.round((c.progress.done / c.progress.total) * 100)}%` }}
            />
          </div>
        )}
      </td>
      <td className="px-4 py-2 text-sm text-gray-500">
        {c.postedAt ? new Date(c.postedAt).toLocaleDateString() : '—'}
      </td>
      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
        {isAdmin && c.status !== 'posted' && (
          <button
            onClick={() => deleteCount(c)}
            className="text-gray-400 hover:text-red-600 px-1"
            title="Delete this count"
          >
            <i className="fas fa-trash text-xs"></i>
          </button>
        )}
      </td>
    </tr>
  ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            onClick={() => navigate('/supplies')}
            className="text-sm text-primary-600 hover:underline mb-1"
          >
            <i className="fas fa-arrow-left mr-1"></i>Inventory &amp; Shop Supplies
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">Cycle Counts</h1>
          <p className="text-sm text-gray-500">
            {open.length} open · {done.length} finished
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" onClick={() => setBuilderOpen(true)}>
            <i className="fas fa-plus mr-2"></i>New count
          </Button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {scopes.length > 0 && (
        <Card title="Saved scopes">
          <div className="flex flex-wrap gap-2">
            {scopes.map((s) => (
              <div
                key={String(s._id)}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 bg-gray-50"
              >
                <div>
                  <div className="text-sm font-medium text-gray-800">{s.name}</div>
                  <div className="text-[11px] text-gray-400">
                    {s.lastRunAt
                      ? `Last run ${new Date(s.lastRunAt).toLocaleDateString()}`
                      : 'Never run'}
                  </div>
                </div>
                {isAdmin && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => runScope(s)} disabled={busy}>
                      Run
                    </Button>
                    <button
                      onClick={() => deleteScope(s)}
                      className="text-gray-400 hover:text-red-600"
                      title={`Delete ${s.name}`}
                    >
                      <i className="fas fa-trash text-xs"></i>
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading ? (
        <Card><p className="text-center text-gray-400 py-8">Loading...</p></Card>
      ) : counts.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">
            No counts yet.{' '}
            {isAdmin
              ? 'Start one by picking a scope — a brand, a shelf, a tag, or any combination.'
              : 'An admin or manager starts a count; you\'ll be able to enter counts here.'}
          </p>
        </Card>
      ) : (
        <>
          {open.length > 0 && (
            <Card title="Open">
              <ResponsiveTable>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Count</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Posted</th>
                    <th className="px-4 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">{renderRows(open)}</tbody>
              </ResponsiveTable>

              <MobileContainer>
                {open.map((c) => (
                  <MobileCard
                    key={String(c._id)}
                    onClick={() => navigate(`/supplies/counts/${c._id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900">{c.name || 'Cycle count'}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge status={c.status} />
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      {c.progress.done} of {c.progress.total} counted
                    </div>
                  </MobileCard>
                ))}
              </MobileContainer>
            </Card>
          )}

          {done.length > 0 && (
            <Card title="Finished">
              <ResponsiveTable>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Count</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Posted</th>
                    <th className="px-4 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">{renderRows(done)}</tbody>
              </ResponsiveTable>

              <MobileContainer>
                {done.map((c) => (
                  <MobileCard
                    key={String(c._id)}
                    onClick={() => navigate(`/supplies/counts/${c._id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-gray-900">{c.name || 'Cycle count'}</div>
                      <Badge status={c.status} />
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {c.postedAt ? new Date(c.postedAt).toLocaleDateString() : ''}
                    </div>
                  </MobileCard>
                ))}
              </MobileContainer>
            </Card>
          )}
        </>
      )}

      <CountScopeBuilder
        isOpen={builderOpen}
        onClose={() => setBuilderOpen(false)}
        tags={tags}
        vocab={vocab}
        fields={fields}
        onStarted={(count) => {
          setBuilderOpen(false);
          navigate(`/supplies/counts/${count._id}`);
        }}
      />
    </div>
  );
};

export default CountList;
