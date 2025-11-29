
import React, { useState, useEffect } from 'react';
import { UserProfile, LogEntry, ViewState, ChatMessage } from './types';
import Dashboard from './components/Dashboard';
import EntryForm from './components/EntryForm';
import ChatInterface from './components/ChatInterface';
import HistoryView from './components/HistoryView';
import { getPersonalizedAdvice, chatWithNutritionist, getInstantFeedback } from './services/geminiService';
import { Home, PlusCircle, MessageCircle, User, Activity, CheckCircle, X, Loader2, Download, Upload } from 'lucide-react';

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

  // Instant Feedback Modal State
  const [feedbackModal, setFeedbackModal] = useState<{ isOpen: boolean; isLoading: boolean; message: string | null }>({
    isOpen: false,
    isLoading: false,
    message: null,
  });

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

  const handleSaveEntry = async (entry: LogEntry) => {
    if (editingLog) {
      setLogs(prev => prev.map(log => log.id === entry.id ? entry : log));
      setEditingLog(null);
      setView('dashboard');
    } else {
      setLogs(prev => [entry, ...prev]);
      setView('dashboard');
      // Trigger Feedback for all new logs (Food, Exercise, Note)
      setFeedbackModal({ isOpen: true, isLoading: true, message: null });
      try {
           const message = await getInstantFeedback(entry, profile);
           setFeedbackModal({ isOpen: true, isLoading: false, message });
      } catch (e) {
           setFeedbackModal({ isOpen: false, isLoading: false, message: null });
      }
    }
  };

  const handleDeleteLog = (id: string) => {
    if (window.confirm("Are you sure you want to delete this entry?")) {
        setLogs(prev => prev.filter(log => log.id !== id));
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

  const closeFeedbackModal = () => {
      setFeedbackModal({ isOpen: false, isLoading: false, message: null });
  };

  const exportData = () => {
      const data = { profile, logs };
      const jsonString = JSON.stringify(data);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "nutriwise_backup.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
              try {
                  const content = e.target?.result as string;
                  const data = JSON.parse(content);
                  if (data.profile && data.logs) {
                      setProfile(data.profile);
                      setLogs(data.logs);
                      alert("Data restored successfully!");
                  } else {
                      alert("Invalid backup file format.");
                  }
              } catch (error) {
                  alert("Failed to parse backup file.");
              }
          };
          reader.readAsText(file);
      }
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col relative overflow-hidden shadow-2xl">
      
      {/* Feedback Modal Overlay */}
      {feedbackModal.isOpen && (
          <div className="absolute inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl transform transition-all scale-100">
                  {feedbackModal.isLoading ? (
                      <div className="flex flex-col items-center py-4">
                          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-3" />
                          <p className="text-slate-600 font-medium animate-pulse">Analyzing your entry...</p>
                      </div>
                  ) : (
                      <div className="text-center">
                          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
                              <CheckCircle size={24} />
                          </div>
                          <h3 className="text-xl font-bold text-slate-800 mb-2">Logged!</h3>
                          <p className="text-slate-600 mb-6 leading-relaxed">
                              "{feedbackModal.message}"
                          </p>
                          <button 
                              onClick={closeFeedbackModal}
                              className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                          >
                              Awesome
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}

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
                    onDelete={handleDeleteLog}
                />
              </div>
          </div>
        )}

        {view === 'history' && (
            <HistoryView 
                logs={logs} 
                onBack={() => setView('dashboard')} 
                onEdit={handleEditLog}
                onDelete={handleDeleteLog}
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
             
                 <div className="pt-8 border-t border-slate-200 mt-8">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4">Data Management</h3>
                      <div className="flex gap-3">
                          <button onClick={exportData} className="flex-1 flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
                              <Download size={24} className="mb-2 text-emerald-600"/>
                              <span className="text-sm font-medium">Backup Data</span>
                          </button>
                          <label className="flex-1 flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 cursor-pointer">
                              <Upload size={24} className="mb-2 text-blue-600"/>
                              <span className="text-sm font-medium">Restore Data</span>
                              <input type="file" accept=".json" onChange={importData} className="hidden" />
                          </label>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 text-center">Use this to move your data to the production URL.</p>
                 </div>
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
