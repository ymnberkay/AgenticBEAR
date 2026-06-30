import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X, Filter, ChevronDown, Calendar, RotateCcw, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ActivityAction } from '@subagent/shared';
import { useActivityUsers } from '../../api/hooks/use-activity';
import { useDebounce } from '../../hooks/use-debounce';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_OPTIONS: { value: ActivityAction | ''; label: string }[] = [
  { value: '', label: 'All actions' },
  { value: 'chat.message', label: 'Chat' },
  { value: 'file.apply', label: 'File approved' },
  { value: 'file.reject', label: 'File rejected' },
  { value: 'agent.create', label: 'Agent created' },
  { value: 'agent.update', label: 'Agent updated' },
  { value: 'agent.delete', label: 'Agent deleted' },
  { value: 'run.start', label: 'Run started' },
  { value: 'run.complete', label: 'Run completed' },
];

const TIME_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range…' },
];

function timePresetRange(value: string): { from: string; to: string } | null {
  switch (value) {
    case '1h':  return { from: new Date(Date.now() - 3_600_000).toISOString(), to: new Date().toISOString() };
    case '24h': return { from: new Date(Date.now() - 86_400_000).toISOString(), to: new Date().toISOString() };
    case '7d':  return { from: new Date(Date.now() - 604_800_000).toISOString(), to: new Date().toISOString() };
    case '30d': return { from: new Date(Date.now() - 2_592_000_000).toISOString(), to: new Date().toISOString() };
    default:    return null;
  }
}

// ─── Shared dropdown trigger button ───────────────────────────────────────────

interface TriggerProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  ariaExpanded: boolean;
}

function DropdownTrigger({ icon, label, active, onClick, ariaLabel, ariaExpanded }: TriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={ariaExpanded}
      className="filter-trigger"
      data-active={active || undefined}
    >
      {icon}
      <span className="filter-trigger-label">{label}</span>
      <ChevronDown className="filter-trigger-chevron" aria-hidden="true" />
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ActivityFilterState {
  action: string;
  userId: string;
  search: string;
  from: string;
  to: string;
  page: number;
}

export interface ActivityFiltersProps {
  filters: ActivityFilterState;
  onFiltersChange: (next: Partial<ActivityFilterState>) => void;
  onReset: () => void;
  projectId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityFilters({ filters, onFiltersChange, onReset, projectId }: ActivityFiltersProps) {
  const { data: users } = useActivityUsers(projectId);

  // ── Local state ──
  const [searchLocal, setSearchLocal] = useState(filters.search);
  const debouncedSearch = useDebounce(searchLocal, 350);
  const [timePreset, setTimePreset] = useState('all');
  const [openDropdown, setOpenDropdown] = useState<'action' | 'user' | 'time' | null>(null);

  // Custom range popover state
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const customRef = useRef<HTMLDivElement>(null);

  // Refs for closing dropdowns on outside click
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Sync debounced search ──
  const prevDebounced = useRef(debouncedSearch);
  useEffect(() => {
    if (debouncedSearch !== prevDebounced.current) {
      prevDebounced.current = debouncedSearch;
      onFiltersChange({ search: debouncedSearch || '', page: 1 });
    }
  }, [debouncedSearch, onFiltersChange]);

  // Sync local search on external reset
  useEffect(() => {
    if (filters.search === '' && searchLocal !== '') setSearchLocal('');
  }, [filters.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Outside click to close all ──
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setCustomOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Derived ──
  const hasActiveFilters = !!(filters.action || filters.userId || filters.search || filters.from || filters.to);
  const selectedActionLabel = ACTION_OPTIONS.find(a => a.value === filters.action)?.label ?? 'All actions';
  const selectedUser = users?.find(u => u.userId === filters.userId);
  const selectedTimeLabel = TIME_OPTIONS.find(t => t.value === timePreset)?.label ?? 'All time';

  // ── Handlers ──
  const handleTimeSelect = useCallback((value: string) => {
    setTimePreset(value);
    setOpenDropdown(null);
    if (value === 'custom') {
      setCustomFrom(filters.from ? new Date(filters.from).toISOString().slice(0, 16) : '');
      setCustomTo(filters.to ? new Date(filters.to).toISOString().slice(0, 16) : '');
      setCustomOpen(true);
      return;
    }
    const range = timePresetRange(value);
    onFiltersChange({
      from: range?.from ?? '',
      to: range?.to ?? '',
      page: 1,
    });
  }, [filters.from, filters.to, onFiltersChange]);

  const handleCustomApply = () => {
    onFiltersChange({
      from: customFrom ? new Date(customFrom).toISOString() : '',
      to: customTo ? new Date(customTo).toISOString() : '',
      page: 1,
    });
    setCustomOpen(false);
  };

  const handleReset = () => {
    setTimePreset('all');
    setSearchLocal('');
    setCustomFrom('');
    setCustomTo('');
    setCustomOpen(false);
    setOpenDropdown(null);
    onReset();
  };

  return (
    <div
      ref={containerRef}
      role="search"
      aria-label="Filter activity log"
      className="activity-filter-bar"
    >
      {/* ── Search ── */}
      <div className="filter-search-wrap">
        <Search className="filter-search-icon" aria-hidden="true" />
        <input
          type="text"
          value={searchLocal}
          onChange={(e) => setSearchLocal(e.target.value)}
          placeholder="Search…"
          aria-label="Search activity log"
          className="filter-search-input"
        />
        {searchLocal && (
          <button
            type="button"
            onClick={() => { setSearchLocal(''); onFiltersChange({ search: '', page: 1 }); }}
            aria-label="Clear search"
            className="filter-search-clear"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* ── Action dropdown ── */}
      <div className="filter-dropdown-wrapper">
        <DropdownTrigger
          icon={<Filter size={12} />}
          label={selectedActionLabel}
          active={!!filters.action}
          onClick={() => setOpenDropdown(openDropdown === 'action' ? null : 'action')}
          ariaLabel="Filter by action type"
          ariaExpanded={openDropdown === 'action'}
        />
        <AnimatePresence>
          {openDropdown === 'action' && (
            <DropdownMenu onClose={() => setOpenDropdown(null)}>
              {ACTION_OPTIONS.map((opt) => (
                <DropdownItem
                  key={opt.value}
                  selected={filters.action === opt.value}
                  onClick={() => { onFiltersChange({ action: opt.value, page: 1 }); setOpenDropdown(null); }}
                >
                  {opt.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          )}
        </AnimatePresence>
      </div>

      {/* ── User dropdown ── */}
      {users && users.length > 0 && (
        <div className="filter-dropdown-wrapper">
          <DropdownTrigger
            icon={<User size={12} />}
            label={selectedUser?.username ?? 'All users'}
            active={!!filters.userId}
            onClick={() => setOpenDropdown(openDropdown === 'user' ? null : 'user')}
            ariaLabel="Filter by user"
            ariaExpanded={openDropdown === 'user'}
          />
          <AnimatePresence>
            {openDropdown === 'user' && (
              <DropdownMenu onClose={() => setOpenDropdown(null)} alignRight>
                <DropdownItem
                  selected={!filters.userId}
                  onClick={() => { onFiltersChange({ userId: '', page: 1 }); setOpenDropdown(null); }}
                >
                  All users
                </DropdownItem>
                {users.map((u) => (
                  <DropdownItem
                    key={u.userId}
                    selected={filters.userId === u.userId}
                    onClick={() => { onFiltersChange({ userId: u.userId, page: 1 }); setOpenDropdown(null); }}
                  >
                    {u.username}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Time range dropdown ── */}
      <div className="filter-dropdown-wrapper">
        <DropdownTrigger
          icon={<Calendar size={12} />}
          label={selectedTimeLabel}
          active={timePreset !== 'all'}
          onClick={() => setOpenDropdown(openDropdown === 'time' ? null : 'time')}
          ariaLabel="Filter by time range"
          ariaExpanded={openDropdown === 'time'}
        />
        <AnimatePresence>
          {openDropdown === 'time' && (
            <DropdownMenu onClose={() => setOpenDropdown(null)} alignRight>
              {TIME_OPTIONS.map((opt) => (
                <DropdownItem
                  key={opt.value}
                  selected={timePreset === opt.value}
                  onClick={() => handleTimeSelect(opt.value)}
                >
                  {opt.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          )}
        </AnimatePresence>
      </div>

      {/* ── Custom range popover ── */}
      <AnimatePresence>
        {customOpen && (
          <div className="filter-custom-backdrop" onClick={() => setCustomOpen(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {customOpen && (
          <motion.div
            ref={customRef}
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="filter-custom-popover"
          >
            <div className="filter-custom-header">Custom date range</div>
            <div className="filter-custom-body">
              <label className="filter-custom-label">
                From
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="filter-custom-input"
                />
              </label>
              <label className="filter-custom-label">
                To
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="filter-custom-input"
                />
              </label>
            </div>
            <div className="filter-custom-actions">
              <button type="button" onClick={() => setCustomOpen(false)} className="filter-custom-cancel">
                Cancel
              </button>
              <button type="button" onClick={handleCustomApply} className="filter-custom-apply">
                Apply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reset ── */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleReset}
          className="filter-reset-btn"
        >
          <RotateCcw size={11} aria-hidden="true" />
          Reset
        </button>
      )}
    </div>
  );
}

// ─── Dropdown menu sub-component ──────────────────────────────────────────────

function DropdownMenu({
  children,
  onClose,
  alignRight,
}: {
  children: React.ReactNode;
  onClose: () => void;
  alignRight?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.12 }}
      role="listbox"
      className="filter-dropdown-menu"
      style={alignRight ? { right: 0 } : { left: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>
  );
}

function DropdownItem({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="filter-dropdown-item"
      data-selected={selected || undefined}
    >
      {children}
    </button>
  );
}
