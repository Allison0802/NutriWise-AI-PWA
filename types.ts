
export interface MacroNutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodItem extends MacroNutrients {
  name: string;
  quantity: number;
  unit: string;
  // Base values per 1 unit for client-side scaling
  baseCalories: number;
  baseProtein: number;
  baseCarbs: number;
  baseFat: number;
  
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

export interface ExerciseItem {
  name: string;
  durationMinutes: number;
  caloriesBurned: number;
  intensity: 'low' | 'medium' | 'high';
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'food' | 'exercise' | 'note';
  items?: FoodItem[]; // If type is food
  exercise?: ExerciseItem; // If type is exercise
  noteContent?: string; // If type is note
  image?: string; // Base64 of uploaded image if applicable
}

export interface UserProfile {
  name: string;
  age: number;
  heightCm: number;
  weightKg: number;
  gender: 'male' | 'female' | 'other';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
  goal: 'lose_fat' | 'maintain' | 'gain_muscle';
  dietaryPreferences: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export type ViewState = 'dashboard' | 'add' | 'chat' | 'profile' | 'history';
