import { FoodItem, UserProfile, LogEntry } from "../types";

const API_ENDPOINT = '/api/gemini';

const callApi = async (action: string, payload: any) => {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, payload }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'API request failed');
    }

    return await response.json();
  } catch (error) {
    console.error(`Gemini Service Error (${action}):`, error);
    throw error;
  }
};

export const analyzeImageOrText = async (
  textInput: string,
  imageBase64?: string
): Promise<{ items: FoodItem[]; clarification?: string }> => {
  try {
    const result = await callApi('analyzeImageOrText', { textInput, imageBase64 });
    
    // Post-process to add base values for client-side scaling
    // We do this on client side now based on the raw data returned from server
    const items: FoodItem[] = (result.items || []).map((item: any) => {
        const qty = item.quantityAmount || 1;
        return {
            name: item.name,
            quantity: qty,
            unit: item.quantityUnit || 'serving',
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            // Calculate base values per 1 unit
            baseCalories: item.calories / qty,
            baseProtein: item.protein / qty,
            baseCarbs: item.carbs / qty,
            baseFat: item.fat / qty,
            confidence: item.confidence,
            notes: item.notes
        };
    });

    return {
      items: items,
      clarification: result.clarificationNeeded ? result.clarificationQuestion : undefined,
    };
  } catch (error: any) {
    // Pass the actual error message (e.g., "API Key missing") to the caller/alert
    alert(`Analysis failed: ${error.message}`);
    throw error;
  }
};

export const refineAnalyzedLogs = async (
  currentItems: FoodItem[],
  userInstruction: string
): Promise<{ items: FoodItem[], message: string }> => {
    try {
        const result = await callApi('refineAnalyzedLogs', { currentItems, userInstruction });
        
        const items: FoodItem[] = (result.updatedItems || []).map((item: any) => {
             const qty = item.quantityAmount || 1;
             return {
                name: item.name,
                quantity: qty,
                unit: item.quantityUnit || 'serving',
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
                baseCalories: item.calories / qty,
                baseProtein: item.protein / qty,
                baseCarbs: item.carbs / qty,
                baseFat: item.fat / qty,
                confidence: item.confidence,
                notes: item.notes
            };
        });

        return {
            items,
            message: result.assistantResponse
        };

    } catch (e: any) {
        return { items: currentItems, message: `Error: ${e.message}` };
    }
}

export const estimateExerciseCalories = async (
  name: string,
  duration: number,
  intensity: string,
  profile: UserProfile
): Promise<{ calories: number; note: string }> => {
  try {
    const result = await callApi('estimateExerciseCalories', { name, duration, intensity, profile });
    return { 
        calories: result.calories || 0,
        note: result.note || "" 
    };
  } catch (e: any) {
    return { calories: duration * 2, note: `Connection error: ${e.message}. Using fallback.` }; 
  }
}

export const getPersonalizedAdvice = async (
  logs: LogEntry[],
  profile: UserProfile
): Promise<string> => {
  try {
    const result = await callApi('getPersonalizedAdvice', { logs, profile });
    return result.text;
  } catch (e) {
    return "Could not generate advice right now.";
  }
};

export const chatWithNutritionist = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  context: { profile: UserProfile; logs: LogEntry[] }
) => {
  try {
    const result = await callApi('chatWithNutritionist', { history, message, context });
    return result.text;
  } catch (error: any) {
    return `Error connecting to assistant: ${error.message}`;
  }
};