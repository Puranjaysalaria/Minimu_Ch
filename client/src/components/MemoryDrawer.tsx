import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Layers,
} from 'lucide-react';
import { MemoryRecord } from '../types/index.js';
import { fetchMemories, searchMemories, fetchMemoryDetails } from '../services/api.js';

interface MemoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MemoryDrawer: React.FC<MemoryDrawerProps> = ({ isOpen, onClose }) => {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [selectedAuditMemory, setSelectedAuditMemory] = useState<MemoryRecord | null>(null);
  const [auditChain, setAuditChain] = useState<MemoryRecord[]>([]);

  const loadMemories = async () => {
    setLoading(true);
    try {
      if (searchTerm.trim()) {
        const results = await searchMemories(searchTerm.trim());
        setMemories(onlyActive ? results.filter(m => !m.valid_until) : results);
      } else {
        const results = await fetchMemories(onlyActive);
        setMemories(results);
      }
    } catch (err) {
      console.error('Failed to load memories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMemories();
    }
  }, [isOpen, onlyActive]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadMemories();
  };

  const handleInspectAudit = async (mem: MemoryRecord) => {
    setSelectedAuditMemory(mem);
    try {
      const details = await fetchMemoryDetails(mem.id);
      setAuditChain(details.auditHistory);
    } catch {
      setAuditChain([mem]);
    }
  };

  if (!isOpen) return null;

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'preference':
        return 'bg-purple-950/80 text-purple-300 border-purple-800';
      case 'budget':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
      case 'decision':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'plan':
        return 'bg-indigo-950/80 text-indigo-300 border-indigo-800';
      case 'correction':
        return 'bg-rose-950/80 text-rose-300 border-rose-800';
      default:
        return 'bg-blue-950/80 text-blue-300 border-blue-800';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md md:max-w-lg bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Memory Vault</h2>
              <p className="text-[11px] text-slate-400">Persistent, versioned conversation facts</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-3 border-b border-slate-800/80 space-y-2">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search subject, predicate, value..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-700"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg border border-slate-700 transition-colors"
            >
              Filter
            </button>
          </form>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-teal-600 focus:ring-0"
              />
              <span>Show active baseline only</span>
            </label>

            <span className="text-[11px] text-slate-500">{memories.length} records</span>
          </div>
        </div>

        {/* Memory Records List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-xs text-slate-500">Loading stored memories...</div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500">
              No memories recorded yet. Start a conversation to teach Minimi facts!
            </div>
          ) : (
            memories.map((mem) => {
              const isSuperseded = !!mem.valid_until;
              return (
                <div
                  key={mem.id}
                  className={`p-3 rounded-xl border transition-all ${
                    isSuperseded
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-75'
                      : 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border ${getCategoryColor(
                        mem.category
                      )}`}
                    >
                      {mem.category}
                    </span>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 font-medium ${
                        isSuperseded
                          ? 'bg-slate-900 text-slate-500 border-slate-800'
                          : 'bg-teal-950/60 text-teal-400 border-teal-800/60'
                      }`}
                    >
                      {isSuperseded ? (
                        <>
                          <Clock className="w-2.5 h-2.5" /> Superseded
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-2.5 h-2.5" /> Active Baseline
                        </>
                      )}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex items-baseline gap-2">
                      <span className="text-slate-400 font-mono text-[11px] shrink-0">
                        {mem.subject} &rarr; {mem.predicate}:
                      </span>
                      <span className="font-semibold text-slate-100 break-words">{mem.value}</span>
                    </div>

                    <div className="text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-slate-800/60">
                      <span>Recorded: {new Date(mem.recorded_at).toLocaleDateString()}</span>
                      <span className="text-slate-400">
                        {mem.source_type === 'explicit_statement' ? 'Explicit statement' : 'Inference'} (
                        {Math.round(mem.confidence * 100)}%)
                      </span>
                    </div>

                    {mem.supersedes_id && (
                      <button
                        onClick={() => handleInspectAudit(mem)}
                        className="mt-2 w-full py-1 px-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] text-purple-300 flex items-center justify-center gap-1 transition-colors"
                      >
                        <History className="w-3 h-3 text-purple-400" />
                        View Version Audit Chain
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Audit Modal/Sheet if open */}
        {selectedAuditMemory && auditChain.length > 0 && (
          <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-purple-300">
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" /> Historical Version Chain
              </span>
              <button
                onClick={() => setSelectedAuditMemory(null)}
                className="text-slate-500 hover:text-slate-300 text-[11px]"
              >
                Close
              </button>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto text-[11px]">
              {auditChain.map((item, idx) => (
                <div
                  key={item.id}
                  className={`p-2 rounded border ${
                    !item.valid_until
                      ? 'border-teal-800/80 bg-teal-950/20 text-teal-200'
                      : 'border-slate-800 bg-slate-900 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between font-medium">
                    <span>
                      v{idx + 1}: {item.value}
                    </span>
                    <span>{new Date(item.valid_from).toLocaleDateString()}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {item.valid_until ? `Valid until ${new Date(item.valid_until).toLocaleDateString()}` : 'Currently Active'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
