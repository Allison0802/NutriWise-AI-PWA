
import React, { useMemo } from 'react';
import { LogEntry } from '../types';
import { format } from 'date-fns';
import { Edit2, ArrowLeft, Trash2, Copy } from 'lucide-react';

interface HistoryViewProps {
  logs: LogEntry[];
  onBack: () => void;
  onEdit: (entry: LogEntry) => void;
  onDelete: (id: string) => void;
  onCopy: (entry: LogEntry) => void;
}

const HistoryView: React.FC<HistoryViewProps> = ({ logs, onBack, onEdit, onDelete, onCopy }) => {
  const groupedLogs = useMemo(() => {
    const groups: { [key: string]: LogEntry[] } = {};
    logs.forEach(log => {
      const dateKey = format(new Date(log.timestamp), 'yyyy-MM-dd');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(log);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs]);

  return (
    <div className="h-full overflow-y-auto pb-24 pt-4 px-4 no-scrollbar">
      <div className="flex items-center gap-4 mb-6 sticky top-0 bg-slate-50 z-10 py-2">
        <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full">
            <ArrowLeft size={24} className="text-slate-700"/>
        </button>
        <h2 className="text-2xl font-bold text-slate-800">History</h2>
      </div>

      <div className="space-y-6">
        {groupedLogs.map(([dateKey, daysLogs]) => (
          <div key={dateKey}>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
              {format(new Date(dateKey), 'EEEE, MMM do')}
            </h3>
            <div className="space-y-3">
              {daysLogs
                .sort((a, b) => b.timestamp - a.timestamp)
                .map(log => (
                <div key={log.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-start gap-3 relative group">
                    <div className={`mt-1 w-2 h-2 rounded-full ${log.type === 'food' ? 'bg-emerald-400' : log.type === 'exercise' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                    <div className="flex-1 pr-24 pb-2">
                        <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium text-slate-800 capitalize">{log.type}</span>
                        </div>
                        {log.type === 'food' && log.items?.map((item, idx) => (
                            <div key={idx} className="text-sm text-slate-600 mt-1 flex justify-between">
                                <span>{item.name} ({item.quantity} {item.unit})</span>
                                <span className="font-medium">{Math.round(item.calories || 0)} kcal</span>
                            </div>
                        ))}
                         {log.type === 'exercise' && log.exercise && (
                            <div className="text-sm text-slate-600 mt-1 flex justify-between">
                                <span>
                                    {log.exercise.name} ({log.exercise.durationMinutes} min)
                                    <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 capitalize">{log.exercise.intensity}</span>
                                </span>
                                <span className="font-medium">-{log.exercise.caloriesBurned} kcal</span>
                            </div>
                        )}
                         {log.type === 'note' && (
                            <p className="text-sm text-slate-600 mt-1 italic">"{log.noteContent}"</p>
                        )}
                    </div>
                    <div className="absolute right-3 top-3 flex gap-1">
                        <button 
                            onClick={() => onCopy(log)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Copy to Today"
                        >
                            <Copy size={16} />
                        </button>
                        <button 
                            onClick={() => onEdit(log)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Edit"
                        >
                            <Edit2 size={16} />
                        </button>
                        <button 
                            onClick={() => onDelete(log.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                    <div className="absolute right-3 bottom-3 text-xs text-slate-400 font-medium">
                        {format(new Date(log.timestamp), 'h:mm a')}
                    </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryView;
