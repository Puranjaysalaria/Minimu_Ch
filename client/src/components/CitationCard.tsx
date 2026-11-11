import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { FormattedCitation } from '../types/index.js';

interface CitationCardProps {
  citation: FormattedCitation;
}

export const CitationCard: React.FC<CitationCardProps> = ({ citation }) => {
  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 hover:border-teal-500/50 transition-all text-xs text-left max-w-sm"
    >
      <div className="flex items-center gap-1.5 font-medium text-slate-300 group-hover:text-teal-300">
        <span className="flex items-center justify-center w-4 h-4 rounded bg-teal-950 text-teal-400 font-bold border border-teal-800 text-[10px]">
          {citation.index}
        </span>
        <Globe className="w-3.5 h-3.5 text-slate-400" />
        <span className="truncate flex-1 font-semibold">{citation.title}</span>
        <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-teal-400 transition-colors shrink-0" />
      </div>

      <div className="text-[11px] text-teal-400/80 font-mono mt-1 truncate">
        {citation.domain}
      </div>

      {citation.excerpt && (
        <p className="text-slate-400 text-[11px] mt-1 line-clamp-2 leading-relaxed">
          {citation.excerpt}
        </p>
      )}

      {citation.publishedAt && (
        <span className="text-[10px] text-slate-500 mt-1.5">
          Published: {new Date(citation.publishedAt).toLocaleDateString()}
        </span>
      )}
    </a>
  );
};
