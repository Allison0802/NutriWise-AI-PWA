
import React, { useState, useEffect } from 'react';
import { UserProfile, LogEntry, ViewState, ChatMessage } from './types';
import Dashboard from './components/Dashboard';
import EntryForm from './components/EntryForm';
import ChatInterface from './components/ChatInterface';
import HistoryView from './components/HistoryView';
import { getPersonalizedAdvice, chatWithNutritionist, getInstantFeedback } from './services/geminiService';
import { Home, PlusCircle, MessageCircle, User, Activity, CheckCircle, X, Loader2, Download, Upload, RefreshCw, AlertTriangle } from 'lucide-react';
import { isSameDay } from 'date-fns';

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
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
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

  // Helper to remove heavy image data from logs before sending to AI context
  const stripImage = (log: LogEntry): LogEntry => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { image, ...rest } = log;
    return rest as LogEntry;
  };

  const stripImages = (logs: LogEntry[]): LogEntry[] => {
    return logs.map(stripImage);
  };

  const handleSaveEntry = async (entry: LogEntry) => {
    let updatedLogs;
    if (editingLog) {
      updatedLogs = logs.map(l => l.id === entry.id ? entry : l);
      setEditingLog(null);
    } else {
      updatedLogs = [entry, ...logs];
    }
    setLogs(updatedLogs);
    setView('dashboard');

    // Trigger Instant Feedback Modal
    setFeedbackModal({ isOpen: true, isLoading: true, message: null });
    
    try {
        // CRITICAL: Strip image data to save thousands of tokens
        const cleanEntry = stripImage(entry);
        const feedback = await getInstantFeedback(cleanEntry, profile);
        setFeedbackModal({ isOpen: true, isLoading: false, message: feedback });
    } catch (e) {
        // Silent failover - if quota exceeded, just show generic success
        console.warn("Feedback skipped due to API limit");
        setFeedbackModal({ isOpen: true, isLoading: false, message: "Entry saved successfully!" });
    }
  };

  const handleDeleteLog = (id: string) => {
    if (window.confirm("Are you sure you want to delete this log?")) {
        setLogs(logs.filter(l => l.id !== id));
    }
  };

  const handleEditLog = (entry: LogEntry) => {
    setEditingLog(entry);
    setView('add');
  };

  const handleCopyLog = (entry: LogEntry) => {
    const newEntry: LogEntry = {
        ...entry,
        id: Date.now().toString(),
        timestamp: Date.now(), // Set to now
    };
    
    // Add to logs immediately
    setLogs([newEntry, ...logs]);
    
    // Show quick feedback
    setFeedbackModal({ 
        isOpen: true, 
        isLoading: false, 
        message: "Copied to today's log!" 
    });
  };

  const handleGenerateAdvice = async () => {
    setIsAdviceLoading(true);
    try {
        // CRITICAL: Strip images from history
        const cleanLogs = stripImages(logs);
        const result = await getPersonalizedAdvice(cleanLogs, profile);
        setAdvice(result);
    } catch (e) {
        setAdvice("Advice currently unavailable.");
    } finally {
        setIsAdviceLoading(false);
    }
  };

  const handleSendChatMessage = async (text: string) => {
      const newUserMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() };
      const updatedHistory = [...chatHistory, newUserMsg];
      setChatHistory(updatedHistory);
      setIsChatLoading(true);

      // Prepare context for AI (Recent history only to save tokens)
      // CRITICAL: Strip images and reduce count
      const recentLogs = stripImages(logs.slice(0, 20)); 
      
      const historyContext = updatedHistory.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.text }]
      }));

      const responseText = await chatWithNutritionist(historyContext, text, { profile, logs: recentLogs });
      
      const newAiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() };
      setChatHistory([...updatedHistory, newAiMsg]);
      setIsChatLoading(false);
  };

  const handleClearChat = () => {
      setChatHistory([]); 
  };

  // Export Data
  const handleExportData = () => {
      const dataStr = JSON.stringify({ profile, logs, chatHistory });
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `nutriwise_backup_${new Date().toISOString().slice(0,10)}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
  };

  // Import Data
  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
      const fileReader = new FileReader();
      if (event.target.files && event.target.files.length > 0) {
          fileReader.readAsText(event.target.files[0], "UTF-8");
          fileReader.onload = e => {
              try {
                  if (e.target?.result) {
                      const parsed = JSON.parse(e.target.result as string);
                      if (parsed.profile) setProfile(parsed.profile);
                      if (parsed.logs) setLogs(parsed.logs);
                      if (parsed.chatHistory) setChatHistory(parsed.chatHistory);
                      alert("Data restored successfully!");
                  }
              } catch (error) {
                  alert("Invalid backup file.");
              }
          };
      }
  };

  // Hard Reset PWA
  const handleHardReset = async () => {
      if (window.confirm("This will force your app to download the latest version from the server. Your logs are safe. Proceed?")) {
          // 1. Unregister Service Workers
          if ('serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              for (const registration of registrations) {
                  await registration.unregister();
              }
          }
          
          // 2. Clear Cache Storage
          if ('caches' in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map(key => caches.delete(key)));
          }
          
          // 3. NUCLEAR OPTION: Force a cache-busting navigation
          // This appends a unique timestamp to the URL, forcing the browser to fetch a fresh index.html
          window.location.href = window.location.pathname + '?reset=' + Date.now();
      }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {view === 'dashboard' && (
          <div className="h-full overflow-y-auto no-scrollbar px-4 pt-4">
            <Dashboard 
                logs={logs} 
                profile={profile} 
                onViewHistory={() => setView('history')} 
                onEdit={handleEditLog}
                onDelete={handleDeleteLog}
            />
            
            {/* Manual Advice Section */}
            <div className="mb-24 bg-white p-4 rounded-xl border border-emerald-100 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-emerald-800 flex items-center gap-2">
                        <Activity size={18} /> Daily Insight
                    </h3>
                    {!advice && (
                        <button 
                            onClick={handleGenerateAdvice} 
                            disabled={isAdviceLoading}
                            className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-medium"
                        >
                            {isAdviceLoading ? 'Generating...' : 'Generate'}
                        </button>
                    )}
                </div>
                {advice ? (
                    <p className="text-sm text-slate-600 italic">{advice}</p>
                ) : (
                    <p className="text-xs text-slate-400">Tap generate to get AI insights based on your recent logs.</p>
                )}
            </div>
          </div>
        )}

        {view === 'add' && (
          <EntryForm 
            onSave={handleSaveEntry} 
            onCancel={() => { setEditingLog(null); setView('dashboard'); }} 
            userProfile={profile}
            initialEntry={editingLog}
            chatHistory={chatHistory} // Pass for consistency if needed
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

        {view === 'history' && (
            <HistoryView 
                logs={logs} 
                onBack={() => setView('dashboard')} 
                onEdit={handleEditLog}
                onDelete={handleDeleteLog}
                onCopy={handleCopyLog}
            />
        )}

        {view === 'profile' && (
          <div className="h-full overflow-y-auto p-6 pb-24 no-scrollbar">
            <h2 className="text-2xl font-bold mb-6 text-slate-800">Your Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full p-3 border rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Age</label>
                  <input
                    type="number"
                    value={profile.age}
                    onChange={(e) => setProfile({ ...profile, age: parseInt(e.target.value) || 0 })}
                    className="w-full p-3 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                  <select
                    value={profile.gender}
                    onChange={(e) => setProfile({ ...profile, gender: e.target.value as any })}
                    className="w-full p-3 border rounded-xl bg-white"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Height (cm)</label>
                  <input
                    type="number"
                    value={profile.heightCm}
                    onChange={(e) => setProfile({ ...profile, heightCm: parseInt(e.target.value) || 0 })}
                    className="w-full p-3 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    value={profile.weightKg}
                    onChange={(e) => setProfile({ ...profile, weightKg: parseInt(e.target.value) || 0 })}
                    className="w-full p-3 border rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Activity Level</label>
                <select
                  value={profile.activityLevel}
                  onChange={(e) => setProfile({ ...profile, activityLevel: e.target.value as any })}
                  className="w-full p-3 border rounded-xl bg-white"
                >
                  <option value="sedentary">Sedentary (Office job)</option>
                  <option value="light">Lightly Active (1-3 days/week)</option>
                  <option value="moderate">Moderately Active (3-5 days/week)</option>
                  <option value="active">Very Active (6-7 days/week)</option>
                  <option value="athlete">Athlete (2x per day)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Goal</label>
                <select
                  value={profile.goal}
                  onChange={(e) => setProfile({ ...profile, goal: e.target.value as any })}
                  className="w-full p-3 border rounded-xl bg-white"
                >
                  <option value="lose_fat">Lose Fat</option>
                  <option value="maintain">Maintain Weight</option>
                  <option value="gain_muscle">Gain Muscle</option>
                </select>
              </div>
              
              <div className="pt-6 border-t border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-600 mb-3">Data Management</h3>
                  <div className="flex gap-3">
                      <button onClick={handleExportData} className="flex-1 py-3 bg-blue-50 text-blue-700 rounded-xl font-medium flex justify-center items-center gap-2 hover:bg-blue-100 transition-colors">
                          <Download size={18} /> Backup
                      </button>
                      <label className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium flex justify-center items-center gap-2 hover:bg-slate-200 transition-colors cursor-pointer">
                          <Upload size={18} /> Restore
                          <input type="file" onChange={handleImportData} className="hidden" accept=".json" />
                      </label>
                  </div>
              </div>

               <div className="pt-4 border-t border-slate-200">
                  <h3 className="text-sm font-semibold text-red-600 mb-3">Troubleshooting</h3>
                  <button onClick={handleHardReset} className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-medium flex justify-center items-center gap-2 hover:bg-red-100 transition-colors border border-red-100">
                      <RefreshCw size={18} /> Force Update / Fix Connection
                  </button>
                  <p className="text-xs text-slate-400 mt-2 text-center">Tap this if you get "Server Busy" errors.</p>
              </div>
              
              <div className="pt-8 text-center">
                  <p className="text-sm font-bold text-slate-400">NutriWise AI <span className="text-red-500 font-extrabold text-lg">v1.3.2</span></p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Navigation Bar */}
      {view !== 'add' && (
        <nav className="bg-white border-t border-slate-200 p-2 safe-area-bottom z-50">
          <div className="flex justify-around items-center">
            <button
              onClick={() => setView('dashboard')}
              className={`p-3 rounded-2xl transition-all ${view === 'dashboard' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400'}`}
            >
              <Home size={24} />
            </button>
            <button
              onClick={() => { setEditingLog(null); setView('add'); }}
              className="p-4 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 transform hover:scale-105 transition-all -mt-8 border-4 border-slate-50"
            >
              <PlusCircle size={32} />
            </button>
            <button
              onClick={() => setView('chat')}
              className={`p-3 rounded-2xl transition-all ${view === 'chat' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400'}`}
            >
              <MessageCircle size={24} />
            </button>
            <button
              onClick={() => setView('profile')}
              className={`p-3 rounded-2xl transition-all ${view === 'profile' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400'}`}
            >
              <User size={24} />
            </button>
          </div>
        </nav>
      )}

      {/* Feedback Modal */}
      {feedbackModal.isOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full text-center relative animate-in zoom-in-95 duration-200">
            {feedbackModal.isLoading ? (
                <div className="py-8">
                    <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
                    <p className="text-slate-600 font-medium">Analyzing your entry...</p>
                </div>
            ) : (
                <>
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle size={28} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Log Saved!</h3>
                    <p className="text-slate-600 italic mb-6">"{feedbackModal.message}"</p>
                    <button 
                        onClick={() => setFeedbackModal({ ...feedbackModal, isOpen: false })}
                        className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700"
                    >
                        Awesome
                    </button>
                </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
