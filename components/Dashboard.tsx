
import React, { useMemo } from 'react';
    import { LogEntry, UserProfile, MacroNutrients } from '../types';
    import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
    import { format, startOfDay, isSameDay, subDays } from 'date-fns';
    import { History, Edit2, Zap } from 'lucide-react';
    
    interface DashboardProps {
      logs: LogEntry[];
      profile: UserProfile;
      onViewHistory: () => void;
      onEdit: (entry: LogEntry) => void;
    }
    
    const Dashboard: React.FC<DashboardProps> = ({ logs, profile, onViewHistory, onEdit }) => {
      // Calculate today's totals
      const { todayTotals, exerciseFocus } = useMemo(() => {
        const start = startOfDay(new Date());
        const todayLogs = logs.filter(log => isSameDay(new Date(log.timestamp), start));
        
        const totals = todayLogs.reduce((acc, log) => {
            if (log.type === 'food' && log.items) {
              log.items.forEach(item => {
                acc.calories += item.calories;
                acc.protein += item.protein;
                acc.carbs += item.carbs;
                acc.fat += item.fat;
              });
            } else if (log.type === 'exercise' && log.exercise) {
                acc.burned += log.exercise.caloriesBurned;
            }
            return acc;
          }, { calories: 0, protein: 0, carbs: 0, fat: 0, burned: 0 });

        // Check for strength/high intensity
        const hasStrength = todayLogs.some(l => 
            l.type === 'exercise' && l.exercise && 
            (l.exercise.intensity === 'high' || 
             l.exercise.name.toLowerCase().includes('weight') || 
             l.exercise.name.toLowerCase().includes('strength') ||
             l.exercise.name.toLowerCase().includes('lift'))
        );

        return { todayTotals: totals, exerciseFocus: hasStrength };
      }, [logs]);
    
      // Prepare chart data (Last 7 days)
      const chartData = useMemo(() => {
        const data = [];
        for (let i = 6; i >= 0; i--) {
          const date = subDays(new Date(), i);
          const dailyLogs = logs.filter(log => isSameDay(new Date(log.timestamp), date));
          const calories = dailyLogs.reduce((sum, log) => {
            if (log.type === 'food' && log.items) {
              return sum + log.items.reduce((s, item) => s + item.calories, 0);
            }
            return sum;
          }, 0);
          data.push({
            name: format(date, 'EEE'),
            calories: calories,
          });
        }
        return data;
      }, [logs]);
    
      // Dynamic TDEE & Goal Calculation including Macros
      const { calorieTarget, macroTargets, adviceMessage } = useMemo(() => {
        let bmr = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
        bmr += profile.gender === 'male' ? 5 : -161;
        
        const activityMultipliers = {
          sedentary: 1.2,
          light: 1.375,
          moderate: 1.55,
          active: 1.725,
          athlete: 1.9
        };
        const tdee = Math.round(bmr * activityMultipliers[profile.activityLevel]);
        
        let target = tdee;
        let msg = '';
        
        // Protein Factor (g per kg bodyweight)
        let proteinFactor = 1.2; // default moderate

        if (profile.goal === 'lose_fat') {
            // Dynamic adjustment: If heavy lifting/high intensity, reduce deficit to preserve muscle
            if (exerciseFocus) {
                target = tdee - 250; // Smaller deficit
                proteinFactor = 2.0; // High protein for recovery
                msg = "Workout detected: Deficit reduced & Protein bumped for recovery.";
            } else {
                target = tdee - 500; // Standard deficit
                proteinFactor = 1.8; // High protein to spare muscle
            }
        } else if (profile.goal === 'gain_muscle') {
            target = tdee + 300;
            proteinFactor = 2.0;
            if (exerciseFocus) {
                proteinFactor = 2.2; // Extra protein on training days
                msg = "Great work! Fuel up for growth.";
            }
        } else {
            // Maintain
            proteinFactor = 1.4;
            if (exerciseFocus) proteinFactor = 1.6;
        }

        const targetProtein = Math.round(profile.weightKg * proteinFactor);
        const targetFat = Math.round((target * 0.25) / 9); // ~25% of calories from fat
        // Remainder for carbs, but ensure non-negative
        const targetCarbs = Math.max(0, Math.round((target - (targetProtein * 4) - (targetFat * 9)) / 4));

        return { 
            calorieTarget: target, 
            macroTargets: { protein: targetProtein, carbs: targetCarbs, fat: targetFat },
            adviceMessage: msg 
        };
      }, [profile, exerciseFocus]);
    
      return (
        <div className="space-y-6 pb-24">
          {/* Header */}
          <header className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Hello, {profile.name}</h1>
              <p className="text-sm text-slate-500">Let's hit your goals today.</p>
            </div>
            <div className="flex gap-2">
                <div className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                     Target: {calorieTarget}
                </div>
                <button onClick={onViewHistory} className="bg-slate-100 text-slate-600 p-2 rounded-full hover:bg-slate-200">
                    <History size={16} />
                </button>
            </div>
          </header>
    
          {/* Today's Summary Card */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h2 className="text-lg font-semibold text-slate-700 mb-4 flex justify-between">
                Today's Intake
                {exerciseFocus && <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-1 rounded-full flex items-center gap-1"><Zap size={10}/> Recovery Mode</span>}
            </h2>
            <div className="flex items-center justify-between mb-6">
               <div className="text-center">
                  <div className="text-3xl font-bold text-emerald-600">{Math.round(todayTotals.calories)}</div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider">Eaten</div>
               </div>
               <div className="h-10 w-px bg-slate-200"></div>
               <div className="text-center">
                  <div className="text-3xl font-bold text-orange-500">{todayTotals.burned}</div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider">Burned</div>
               </div>
               <div className="h-10 w-px bg-slate-200"></div>
               <div className="text-center">
                  <div className={`text-3xl font-bold ${calorieTarget - todayTotals.calories + todayTotals.burned >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                    {Math.round(Math.abs(calorieTarget - todayTotals.calories + todayTotals.burned))}
                  </div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider">{calorieTarget - todayTotals.calories + todayTotals.burned >= 0 ? 'Left' : 'Over'}</div>
               </div>
            </div>

            {adviceMessage && (
                <p className="text-xs text-slate-500 text-center mb-4 italic">{adviceMessage}</p>
            )}
    
            {/* Macros */}
            <div className="grid grid-cols-3 gap-2">
                <MacroCard 
                    label="Protein" 
                    amount={todayTotals.protein} 
                    target={macroTargets.protein}
                    color="bg-blue-500" 
                    highlight={exerciseFocus} 
                />
                <MacroCard 
                    label="Carbs" 
                    amount={todayTotals.carbs} 
                    target={macroTargets.carbs}
                    color="bg-yellow-500" 
                />
                <MacroCard 
                    label="Fat" 
                    amount={todayTotals.fat} 
                    target={macroTargets.fat}
                    color="bg-red-500" 
                />
            </div>
          </div>
    
          {/* Trends Chart */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h2 className="text-lg font-semibold text-slate-700 mb-4">Last 7 Days</h2>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: '#f1f5f9'}}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  />
                  <Bar dataKey="calories" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.calories > calorieTarget ? '#fbbf24' : '#34d399'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily Log List */}
           <div className="space-y-3">
             <h2 className="text-lg font-semibold text-slate-700 px-1">Today's Logs</h2>
             {logs.filter(l => isSameDay(new Date(l.timestamp), new Date())).length === 0 ? (
                <p className="text-slate-400 text-sm text-center italic py-4">Nothing logged yet.</p>
             ) : (
                logs
                .filter(l => isSameDay(new Date(l.timestamp), new Date()))
                .sort((a,b) => b.timestamp - a.timestamp)
                .map(log => (
                    <div key={log.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-start gap-3 relative group">
                        <div className={`mt-1 w-2 h-2 rounded-full ${log.type === 'food' ? 'bg-emerald-400' : log.type === 'exercise' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                        <div className="flex-1 pr-8">
                            <div className="flex justify-between">
                                <span className="text-sm font-medium text-slate-800 capitalize">{log.type}</span>
                                <span className="text-xs text-slate-400">{format(new Date(log.timestamp), 'h:mm a')}</span>
                            </div>
                            {log.type === 'food' && log.items?.map((item, idx) => (
                                <div key={idx} className="text-sm text-slate-600 mt-1 flex justify-between">
                                    <span>{item.name} ({item.quantity} {item.unit})</span>
                                    <span className="font-medium">{Math.round(item.calories)} kcal</span>
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
                        <button 
                            onClick={() => onEdit(log)}
                            className="absolute right-3 top-3 p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                            <Edit2 size={16} />
                        </button>
                    </div>
                ))
             )}
           </div>
        </div>
      );
    };
    
    const MacroCard: React.FC<{ label: string; amount: number; target: number; color: string; highlight?: boolean }> = ({ label, amount, target, color, highlight }) => {
        const progress = Math.min((amount / target) * 100, 100);
        
        return (
          <div className={`bg-slate-50 p-3 rounded-xl flex flex-col justify-between ${highlight && label === 'Protein' ? 'ring-2 ring-blue-200 bg-blue-50' : ''}`}>
            <div className="flex items-center justify-between mb-2">
               <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${color}`}></div>
                  <span className="text-xs text-slate-500">{label}</span>
               </div>
               {highlight && label === 'Protein' && <Zap size={10} className="text-blue-500"/>}
            </div>
            
            <div className="flex items-end gap-1 mb-1">
                <span className="font-bold text-slate-800 text-lg">{Math.round(amount)}</span>
                <span className="text-xs text-slate-400 mb-1">/ {target}g</span>
            </div>
    
            {/* Progress Bar */}
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                 <div className={`h-full rounded-full ${color}`} style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        );
    };
    
    export default Dashboard;
