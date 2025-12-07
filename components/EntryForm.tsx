
import React, { useState, useRef, useEffect } from 'react';
import { FoodItem, LogEntry, ExerciseItem, UserProfile, ChatMessage } from '../types';
import { analyzeImageOrText, refineAnalyzedLogs, estimateExerciseCalories } from '../services/geminiService';
import { Camera, Image as ImageIcon, Loader2, Plus, X, Check, Mic, Calculator, MessageSquare, Send, Zap, Flame, ChevronRight } from 'lucide-react';

const STARTER_MESSAGE = 'Hi! I can help you analyze your nutrition logs, suggest meals, or answer health questions. What can I do for you?';

interface EntryFormProps {
  onSave: (entry: LogEntry) => void;
  onCancel: () => void;
  userProfile?: UserProfile;
  initialEntry?: LogEntry | null;
  chatHistory: ChatMessage[];
  onChat: (text: string) => Promise<void>;
  isChatLoading: boolean;
}

const EntryForm: React.FC<EntryFormProps> = ({ onSave, onCancel, userProfile, initialEntry, chatHistory, onChat, isChatLoading }) => {
  const [activeTab, setActiveTab] = useState<'food' | 'exercise' | 'note'>('food');
  const [textInput, setTextInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedItems, setAnalyzedItems] = useState<FoodItem[] | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Assistant State
  const [showAssistant, setShowAssistant] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState('');
  const [assistantInput, setAssistantInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // Exercise state
  const [exName, setExName] = useState('');
  const [exDuration, setExDuration] = useState('');
  const [exCals, setExCals] = useState('');
  const [exIntensity, setExIntensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [exNote, setExNote] = useState<string>('');
  const [isEstimatingEx, setIsEstimatingEx] = useState(false);

  useEffect(() => {
    if (initialEntry) {
      setActiveTab(initialEntry.type);
      if (initialEntry.type === 'food') {
        setAnalyzedItems(initialEntry.items || []);
        if (initialEntry.image) setSelectedImage(initialEntry.image);
      } else if (initialEntry.type === 'exercise' && initialEntry.exercise) {
        setExName(initialEntry.exercise.name);
        setExDuration(initialEntry.exercise.durationMinutes.toString());
        setExCals(initialEntry.exercise.caloriesBurned.toString());
        setExIntensity(initialEntry.exercise.intensity);
      } else if (initialEntry.type === 'note') {
        setTextInput(initialEntry.noteContent || '');
      }
    }
  }, [initialEntry]);

  const getSafeProfile = (): UserProfile => {
      if (userProfile) return userProfile;
      return {
          name: 'Guest',
          age: 30,
          heightCm: 170,
          weightKg: 70,
          gender: 'female', 
          activityLevel: 'moderate',
          goal: 'maintain',
          dietaryPreferences: ''
      };
  };

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          // OPTIMIZATION: Max dimensions 512px
          const MAX_WIDTH = 512;
          const MAX_HEIGHT = 512;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          // Compress to JPEG at 0.5 quality to save bandwidth/tokens
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          resolve(dataUrl.split(',')[1]); // Return just base64 data
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const resizedBase64 = await resizeImage(file);
        setSelectedImage(resizedBase64);
      } catch (error) {
        console.error("Image processing failed", error);
        alert("Failed to process image. Please try another one.");
      }
    }
  };

  const handleAnalyzeFood = async () => {
    if (!textInput && !selectedImage) return;
    setIsAnalyzing(true);
    setAnalyzedItems(null);
    setClarification(null);

    try {
      const result = await analyzeImageOrText(textInput, selectedImage || undefined);
      setAnalyzedItems(result.items);
      if (result.clarification) {
        setClarification(result.clarification);
      }
    } catch (error: any) {
      const msg = error.message || "";
      if (msg.includes("429") || msg.includes("busy")) {
         alert("Server is extremely busy (Rate Limit). Waiting a moment before retrying usually works.");
      } else {
         alert(`Analysis failed: ${msg}. Try reducing image size or try again.`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRefine = async () => {
      if (!assistantInput.trim() || !analyzedItems) return;
      setIsRefining(true);
      try {
          const result = await refineAnalyzedLogs(analyzedItems, assistantInput);
          setAnalyzedItems(result.items);
          setAssistantMessage(result.message);
          setAssistantInput('');
      } catch (e) {
          setAssistantMessage("Failed to update items.");
      } finally {
          setIsRefining(false);
      }
  }

  const saveFoodLog = () => {
    if (!analyzedItems) return;
    
    // Sanitize items to ensure all numbers are valid numbers to prevent crashes
    const sanitizedItems = analyzedItems.map(item => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        calories: Number(item.calories) || 0,
        protein: Number(item.protein) || 0,
        carbs: Number(item.carbs) || 0,
        fat: Number(item.fat) || 0,
        baseCalories: Number(item.baseCalories) || 0,
        baseProtein: Number(item.baseProtein) || 0,
        baseCarbs: Number(item.baseCarbs) || 0,
        baseFat: Number(item.baseFat) || 0,
    }));

    const newEntry: LogEntry = {
      id: initialEntry ? initialEntry.id : Date.now().toString(),
      timestamp: initialEntry ? initialEntry.timestamp : Date.now(),
      type: 'food',
      items: sanitizedItems,
      image: selectedImage || undefined
    };
    onSave(newEntry);
  };

  const handleEstimateExercise = async () => {
      if (!exName || !exDuration) {
          alert("Please enter exercise name and duration.");
          return;
      }
      setIsEstimatingEx(true);
      setExNote('');
      try {
          const profile = getSafeProfile();
          const result = await estimateExerciseCalories(exName, parseInt(exDuration), exIntensity, profile);
          setExCals(result.calories.toString());
          if (result.note) setExNote(result.note);
      } catch(e) {
          alert("Could not estimate calories. Please enter manually.");
      } finally {
          setIsEstimatingEx(false);
      }
  }

  const saveExerciseLog = async () => {
      if (!exName || !exDuration) {
          alert("Please enter exercise name and duration.");
          return;
      }

      let calories = parseInt(exCals);
      
      if (isNaN(calories) || calories === 0) {
          setIsEstimatingEx(true);
          try {
             const profile = getSafeProfile();
             const result = await estimateExerciseCalories(exName, parseInt(exDuration), exIntensity, profile);
             calories = result.calories;
             setExCals(calories.toString());
          } catch(e) {
             calories = parseInt(exDuration) * 3;
          } finally {
             setIsEstimatingEx(false);
          }
      }

      const newEntry: LogEntry = {
          id: initialEntry ? initialEntry.id : Date.now().toString(),
          timestamp: initialEntry ? initialEntry.timestamp : Date.now(),
          type: 'exercise',
          exercise: {
              name: exName,
              durationMinutes: parseInt(exDuration),
              caloriesBurned: calories || 0, // Ensure no NaN
              intensity: exIntensity
          }
      };
      onSave(newEntry);
  }

  const saveNoteLog = () => {
      const newEntry: LogEntry = {
          id: initialEntry ? initialEntry.id : Date.now().toString(),
          timestamp: initialEntry ? initialEntry.timestamp : Date.now(),
          type: 'note',
          noteContent: textInput
      }
      onSave(newEntry);
  }

  // Client-side Scaling
  const updateItemQuantity = (index: number, newQty: number) => {
      if (!analyzedItems) return;
      const newItems = [...analyzedItems];
      const item = newItems[index];
      
      item.quantity = newQty;
      item.calories = Math.round(item.baseCalories * newQty);
      item.protein = Math.round(item.baseProtein * newQty * 10) / 10;
      item.carbs = Math.round(item.baseCarbs * newQty * 10) / 10;
      item.fat = Math.round(item.baseFat * newQty * 10) / 10;

      setAnalyzedItems(newItems);
  }

  const updateItemField = (index: number, field: keyof FoodItem, value: any) => {
    if (!analyzedItems) return;
    const newItems = [...analyzedItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setAnalyzedItems(newItems);
  };

  const removeImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // --- Normal Form Render ---
  return (
    <div className="bg-white h-full overflow-y-auto pb-20 relative no-scrollbar">
      <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-20">
        <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full">
          <X className="w-6 h-6 text-slate-500" />
        </button>
        <h2 className="font-semibold text-lg">{initialEntry ? 'Edit Entry' : 'New Entry'}</h2>
        <div className="w-10"></div>
      </div>

      <div className="flex p-2 gap-2 justify-center border-b bg-slate-50">
          {(['food', 'exercise', 'note'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                disabled={!!initialEntry} 
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === tab ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200'} ${initialEntry ? 'opacity-75 cursor-default' : ''}`}
              >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
          ))}
      </div>

      <div className="p-4">
        {activeTab === 'food' && (
          <div className="space-y-6">
            {!analyzedItems ? (
              <>
                <div className="space-y-4">
                  <div className="relative">
                     {selectedImage ? (
                         <div className="relative rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-900">
                             <img src={`data:image/jpeg;base64,${selectedImage}`} className="w-full h-full object-contain" alt="Preview" />
                             <button onClick={removeImage} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full"><X size={16}/></button>
                         </div>
                     ) : (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-300 rounded-xl aspect-video flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-50 hover:border-emerald-400 transition-colors"
                        >
                            <Camera className="w-8 h-8 mb-2" />
                            <span className="text-sm">Tap to take photo or upload</span>
                        </div>
                     )}
                     <input 
                        ref={fileInputRef}
                        type="file" 
                        accept="image/*" 
                        // capture attribute removed to allow gallery selection
                        className="hidden" 
                        onChange={handleImageUpload}
                    />
                  </div>

                  <div className="relative">
                      <textarea
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Describe your meal (e.g., '2 eggs and toast')..."
                        className="w-full p-4 pr-12 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 resize-none h-32"
                      />
                      <Mic className="absolute bottom-4 right-4 text-slate-400" />
                  </div>

                  <button
                    onClick={handleAnalyzeFood}
                    disabled={isAnalyzing || (!textInput && !selectedImage)}
                    className="w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold shadow-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isAnalyzing ? <Loader2 className="animate-spin" /> : <Plus />}
                    {isAnalyzing ? 'Analyzing with AI...' : 'Analyze Food'}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4 pb-24">
                <div className="bg-blue-50 p-4 rounded-lg text-blue-800 text-sm flex justify-between items-start">
                   <div>
                       {clarification ? (
                           <p className="font-semibold mb-2">Wait, {clarification}</p>
                       ) : (
                           <p>Please review the estimates. Adjust quantity to see macros update instantly, or ask the AI for help.</p>
                       )}
                   </div>
                   <button onClick={() => setShowAssistant(!showAssistant)} className="text-blue-600 underline text-xs font-semibold whitespace-nowrap ml-2">
                       {showAssistant ? 'Hide Chat' : 'Ask AI'}
                   </button>
                </div>

                {showAssistant && (
                    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md mb-4 border-l-4 border-l-emerald-500">
                        <div className="flex items-center gap-2 mb-2 text-emerald-700 font-semibold text-sm">
                            <MessageSquare size={16} /> AI Assistant
                        </div>
                        {assistantMessage && (
                            <p className="text-sm text-slate-600 mb-3 bg-slate-50 p-2 rounded">{assistantMessage}</p>
                        )}
                        <div className="flex gap-2">
                            <input 
                                value={assistantInput}
                                onChange={e => setAssistantInput(e.target.value)}
                                placeholder="e.g. 'I actually had 200g of chicken'"
                                className="flex-1 text-sm border rounded-lg px-3 py-2"
                                onKeyDown={e => e.key === 'Enter' && handleRefine()}
                            />
                            <button onClick={handleRefine} disabled={isRefining} className="bg-emerald-600 text-white p-2 rounded-lg">
                                {isRefining ? <Loader2 className="animate-spin w-4 h-4"/> : <Send size={16}/>}
                            </button>
                        </div>
                    </div>
                )}

                {analyzedItems.map((item, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm space-y-3">
                    <div className="flex justify-between items-start">
                        <input 
                            value={item.name} 
                            onChange={(e) => updateItemField(idx, 'name', e.target.value)}
                            className="font-bold text-slate-800 border-b border-transparent focus:border-slate-300 focus:outline-none bg-transparent"
                        />
                        <button onClick={() => {
                            const newItems = analyzedItems.filter((_, i) => i !== idx);
                            setAnalyzedItems(newItems);
                        }} className="text-red-400 p-1"><X size={16} /></button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 items-end">
                        <div className="flex items-end gap-2 border rounded-lg p-2 bg-slate-50">
                            <div className="flex-1">
                                <label className="text-[10px] text-slate-400 block mb-1 uppercase tracking-wide">Qty</label>
                                <input 
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => updateItemQuantity(idx, parseFloat(e.target.value) || 0)}
                                    className="w-full text-base font-semibold bg-transparent border-none p-0 focus:ring-0"
                                    step="0.1"
                                />
                            </div>
                            <div className="flex-1 border-l border-slate-200 pl-2">
                                <label className="text-[10px] text-slate-400 block mb-1 uppercase tracking-wide">Unit</label>
                                <input 
                                    value={item.unit}
                                    onChange={(e) => updateItemField(idx, 'unit', e.target.value)}
                                    className="w-full text-sm bg-transparent border-none p-0 focus:ring-0 text-slate-600"
                                />
                            </div>
                        </div>
                        
                        <div className="p-2 text-right">
                             <div className="text-2xl font-bold text-emerald-600">{Math.round(item.calories)}</div>
                             <div className="text-xs text-slate-400">calories</div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 mt-2">
                        <div className="bg-blue-50 p-2 rounded-lg text-center">
                            <span className="block text-xs text-blue-400 font-bold uppercase">Prot</span>
                            <span className="font-semibold text-slate-700">{item.protein}g</span>
                        </div>
                        <div className="bg-yellow-50 p-2 rounded-lg text-center">
                            <span className="block text-xs text-yellow-500 font-bold uppercase">Carb</span>
                            <span className="font-semibold text-slate-700">{item.carbs}g</span>
                        </div>
                        <div className="bg-red-50 p-2 rounded-lg text-center">
                            <span className="block text-xs text-red-400 font-bold uppercase">Fat</span>
                            <span className="font-semibold text-slate-700">{item.fat}g</span>
                        </div>
                    </div>
                    {item.notes && <p className="text-xs text-slate-400 italic mt-2">{item.notes}</p>}
                  </div>
                ))}
                
                 <button
                    onClick={() => setAnalyzedItems([...analyzedItems, { name: 'New Item', quantity: 1, unit: 'serving', baseCalories: 100, baseProtein: 5, baseCarbs: 10, baseFat: 5, calories: 100, protein: 5, carbs: 10, fat: 5, confidence: 'high' }])}
                    className="w-full py-3 border border-dashed border-slate-300 text-slate-500 rounded-xl hover:bg-slate-50"
                  >
                    + Add Manual Item
                  </button>

                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 z-10">
                    <div className="flex gap-3 max-w-md mx-auto">
                        <button onClick={() => setAnalyzedItems(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium">Back</button>
                        <button onClick={saveFoodLog} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 flex justify-center items-center gap-2">
                            <Check size={20} /> {initialEntry ? 'Update Entry' : 'Save Log'}
                        </button>
                    </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'exercise' && (
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Exercise Name</label>
                    <input type="text" value={exName} onChange={e => setExName(e.target.value)} placeholder="e.g. Running" className="w-full p-3 border rounded-xl" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Duration (minutes)</label>
                    <input type="number" value={exDuration} onChange={e => setExDuration(e.target.value)} placeholder="30" className="w-full p-3 border rounded-xl" />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Intensity</label>
                    <div className="flex gap-2">
                        {['low', 'medium', 'high'].map(level => (
                            <button
                                key={level}
                                onClick={() => setExIntensity(level as any)}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize border transition-all ${exIntensity === level ? 'bg-orange-50 border-orange-400 text-orange-700 ring-1 ring-orange-400' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center justify-center gap-1">
                                    <Flame size={14} className={exIntensity === level ? 'fill-orange-500 text-orange-500' : 'text-slate-400'} />
                                    {level}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Calories Burned</label>
                    <div className="relative">
                        <input type="number" value={exCals} onChange={e => setExCals(e.target.value)} placeholder="0" className="w-full p-3 border rounded-xl" />
                        <button 
                            onClick={handleEstimateExercise}
                            disabled={isEstimatingEx || !exName || !exDuration}
                            className="absolute right-2 top-2 bottom-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                            {isEstimatingEx ? <Loader2 className="animate-spin w-3 h-3" /> : <Zap size={14} className="text-orange-500"/>}
                            {isEstimatingEx ? '...' : 'Estimate'}
                        </button>
                    </div>
                    {exNote && (
                         <div className="mt-2 p-2 bg-orange-50 border border-orange-100 rounded-lg flex items-start gap-2">
                             <div className="text-orange-400 mt-0.5"><Zap size={12} /></div>
                             <p className="text-xs text-orange-800">{exNote}</p>
                         </div>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1 ml-1">Click Estimate to calculate based on duration & intensity, then adjust if needed.</p>
                </div>

                <button onClick={saveExerciseLog} disabled={isEstimatingEx} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold mt-4 flex justify-center items-center gap-2">
                    {isEstimatingEx ? <Loader2 className="animate-spin" /> : null}
                    {initialEntry ? 'Update Exercise' : 'Save Exercise'}
                </button>
            </div>
        )}

         {activeTab === 'note' && (
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Daily Note</label>
                    <textarea value={textInput} onChange={e => setTextInput(e.target.value)} placeholder="How are you feeling today?" className="w-full p-3 border rounded-xl h-40" />
                </div>
                <button onClick={saveNoteLog} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold mt-4 flex items-center justify-center gap-2">
                    <Check size={20} />
                    {initialEntry ? 'Update Note' : 'Save Note'}
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default EntryForm;
