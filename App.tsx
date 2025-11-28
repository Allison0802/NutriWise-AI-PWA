import React, { useState, useEffect } from 'react';
import { UserProfile, LogEntry, ViewState, ChatMessage } from './types';
import Dashboard from './components/Dashboard';
import EntryForm from './components/EntryForm';
import ChatInterface from './components/ChatInterface';
import HistoryView from './components/HistoryView';
import { getPersonalizedAdvice, chatWithNutritionist } from './services/geminiService';
import { Home, PlusCircle, MessageCircle, User, Activity } from 'lucide-react';

// Default initial state
const INITIAL_PROFILE: UserProfile = {
  name: 'User',
  age: 30,
  heightCm: 175,
  weightKg: 70,
  gender: 'male',
  activityLevel: 'moderate',
  goal: 'maintain',
  dietaryPreferences: 'none'
};

const App: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const saved = localStorage.getItem('nutriwise_logs');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('nutriwise_profile');
    return saved ? JSON.parse(saved) : INITIAL_PROFILE;
  });

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('nutriwise_chat');
    return saved ? JSON.parse(saved) : [{ 
        id: '0', 
        role: 'model', 
        text: 'Hi! I can help you analyze your nutrition logs, suggest meals, or answer health questions. What can I do for you?', 
        timestamp: Date.now() 
    }];
  });

  const [view, setView] = useState<ViewState>('dashboard');
  const [advice, setAdvice] = useState<string | null>(null);
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('nutriwise_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('nutriwise_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('nutriwise_chat', JSON.stringify(chatHistory));
  }, [chatHistory]);

  // Generate advice periodically (e.g., on mount if we have logs)
  useEffect(() => {
    const fetchAdvice = async () => {
      if (logs.length > 0 && !advice) {
        const result = await getPersonalizedAdvice(logs, profile);
        setAdvice(result);
      }
    };
    fetchAdvice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs.length]);

  const handleSaveEntry = (entry: LogEntry) => {
    if (editingLog) {
      setLogs(prev => prev.map(log => log.id === entry.id ? entry : log));
      setEditingLog(null);
      // Don't switch view if updating note (handled in EntryForm)
      if (entry.type !== 'note') setView('dashboard');
    } else {
      setLogs(prev => [entry, ...prev]);
      if (entry.type !== 'note') setView('dashboard');
    }
  };

  const handleEditLog = (entry: LogEntry) => {
    setEditingLog(entry);
    setView('add');
  };

  const handleCancelEntry = () => {
      setEditingLog(null);
      setView('dashboard');
  }

  const handleSendChatMessage = async (text: string) => {
      if (!text.trim()) return;
      
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() };
      setChatHistory(prev => [...prev, userMsg]);
      setIsChatLoading(true);

      // Pass the last 100 logs to provide historical context
      const recentLogs = logs.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);

      // We pass the history excluding the just-added user message to avoid duplication in context if API requires it, 
      // but standard practice with Gemini Chat helper is to pass previous history.
      const historyContext = chatHistory.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
      }));

      const responseText = await chatWithNutritionist(historyContext, text, { profile, logs: recentLogs });

      const modelMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() };
      setChatHistory(prev => [...prev, modelMsg]);
      setIsChatLoading(false);
  }

  const handleClearChat = () => {
      // Immediate reset without confirmation to ensure UI responsiveness
      const newId = Date.now().toString();
      setChatHistory([{ 
          id: newId, 
          role: 'model', 
          text: 'Hi! I can help you analyze your nutrition logs, suggest meals, or answer health questions. What can I do for you?', 
          timestamp: Date.now() 
      }]);
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col relative overflow-hidden shadow-2xl">
      
      {/* Main Content Area - now overflow-hidden to let children handle scroll */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {view === 'dashboard' && (
          <div className="h-full overflow-y-auto no-scrollbar">
             <div className="p-4">
                {advice && (
                  <div className="mb-6 bg-gradient-to-r from-emerald-600 to-emerald-800 rounded-2xl p-4 text-white shadow-lg">
                    <h3 className="flex items-center gap-2 font-bold mb-2 text-sm uppercase tracking-wide opacity-90">
                      <Activity size={16} /> Daily Insight
                    </h3>
                    <div className="text-sm leading-relaxed opacity-95">
                        {advice.split('\n').map((line, i) => (
                            <p key={i} className="mb-1">{line}</p>
                        ))}
                    </div>
                  </div>
                )}
                <Dashboard 
                    logs={logs} 
                    profile={profile} 
                    onViewHistory={() => setView('history')} 
                    onEdit={handleEditLog}
                />
              </div>
          </div>
        )}

        {view === 'history' && (
            <HistoryView 
                logs={logs} 
                onBack={() => setView('dashboard')} 
                onEdit={handleEditLog}
            />
        )}

        {view === 'add' && (
          <EntryForm 
            onSave={handleSaveEntry} 
            onCancel={handleCancelEntry} 
            userProfile={profile} 
            initialEntry={editingLog}
            chatHistory={chatHistory}
            onChat={handleSendChatMessage}
            isChatLoading={isChatLoading}
          />
        )}

        {view === 'chat' && (
          <ChatInterface 
             messages={chatHistory}
             onSendMessage={handleSendChatMessage}
             onClearChat={handleClearChat}
             isLoading={isChatLoading}
          />
        )}

        {view === 'profile' && (
          <div className="h-full overflow-y-auto no-scrollbar p-6 pb-24">
             <h2 className="text-2xl font-bold text-slate-800 mb-6">Profile Settings</h2>
             <div className="space-y-4">
                 <div>
                     <label className="block text-sm font-medium text-slate-700">Display Name</label>
                     <input type="text" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full mt-1 p-3 border rounded-xl" />
                 </div>
                 
                 <div>
                     <label className="block text-sm font-medium text-slate-700">Gender</label>
                     <select value={profile.gender} onChange={e => setProfile({...profile, gender: e.target.value as any})} className="w-full mt-1 p-3 border rounded-xl bg-white">
                         <option value="male">Male</option>
                         <option value="female">Female</option>
                         <option value="other">Other</option>
                     </select>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700">Weight (kg)</label>
                        <input type="number" value={profile.weightKg} onChange={e => setProfile({...profile, weightKg: parseFloat(e.target.value)})} className="w-full mt-1 p-3 border rounded-xl" />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">Height (cm)</label>
                        <input type="number" value={profile.heightCm} onChange={e => setProfile({...profile, heightCm: parseFloat(e.target.value)})} className="w-full mt-1 p-3 border rounded-xl" />
                     </div>
                 </div>
                 <div>
                     <label className="block text-sm font-medium text-slate-700">Goal</label>
                     <select value={profile.goal} onChange={e => setProfile({...profile, goal: e.target.value as any})} className="w-full mt-1 p-3 border rounded-xl bg-white">
                         <option value="lose_fat">Lose Fat</option>
                         <option value="maintain">Maintain Weight</option>
                         <option value="gain_muscle">Build Muscle</option>
                     </select>
                 </div>
                 <div>
                     <label className="block text-sm font-medium text-slate-700">Activity Level</label>
                     <select value={profile.activityLevel} onChange={e => setProfile({...profile, activityLevel: e.target.value as any})} className="w-full mt-1 p-3 border rounded-xl bg-white">
                         <option value="sedentary">Sedentary (Office job)</option>
                         <option value="light">Light Activity</option>
                         <option value="moderate">Moderate Exercise</option>
                         <option value="active">Active</option>
                         <option value="athlete">Athlete</option>
                     </select>
                 </div>
                 <button className="w-full bg-slate-800 text-white py-3 rounded-xl font-medium mt-4" onClick={() => setView('dashboard')}>Save Profile</button>
             </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      {view !== 'add' && view !== 'history' && (
        <nav className="bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center sticky bottom-0 z-50 safe-area-bottom">
          <button 
            onClick={() => setView('dashboard')}
            className={`flex flex-col items-center gap-1 ${view === 'dashboard' ? 'text-emerald-600' : 'text-slate-400'}`}
          >
            <Home size={24} strokeWidth={view === 'dashboard' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Home</span>
          </button>

          {/* Floating Add Button */}
          <button 
            onClick={() => { setEditingLog(null); setView('add'); }}
            className="bg-emerald-600 text-white p-4 rounded-full shadow-emerald-200 shadow-xl transform -translate-y-4 hover:scale-105 transition-transform"
          >
            <PlusCircle size={32} />
          </button>

          <button 
            onClick={() => setView('chat')}
             className={`flex flex-col items-center gap-1 ${view === 'chat' ? 'text-emerald-600' : 'text-slate-400'}`}
          >
            <MessageCircle size={24} strokeWidth={view === 'chat' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">AI Chat</span>
          </button>
          
          <button 
            onClick={() => setView('profile')}
             className={`flex flex-col items-center gap-1 ${view === 'profile' ? 'text-emerald-600' : 'text-slate-400'}`}
          >
            <User size={24} strokeWidth={view === 'profile' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Profile</span>
          </button>
        </nav>
      )}
    </div>
  );
};

export default App;