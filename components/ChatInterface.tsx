
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { Send, Bot, Loader2, RefreshCw } from 'lucide-react';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onClearChat: () => void;
  isLoading: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, onClearChat, isLoading }) => {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput('');
    await onSendMessage(text);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b p-4 shadow-sm z-10 flex justify-between items-center shrink-0">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Bot className="text-emerald-500" />
            AI Nutritionist
        </h2>
        <button 
          type="button"
          onClick={onClearChat} 
          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded-full transition-colors active:scale-95"
          title="Start New Chat"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        {isLoading && (
            <div className="flex justify-start">
                <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none shadow-sm">
                    <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                </div>
            </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-200 safe-area-bottom shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about your diet..."
            className="flex-1 p-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button 
            type="button"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
