
import { FoodItem, UserProfile, LogEntry } from "../types";

const API_ENDPOINT = '/api/gemini';

const callApi = async (action: string, payload: any, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, payload }),
      });

      // Handle Rate Limiting (429) and Server Overload (503) explicitly to trigger retry
      if (response.status === 429 || response.status === 503) {
         throw new Error(`Server is busy (Status ${response.status})`);
      }

      const contentType = response.headers.get("content-type");
      
      // Check if the response is actually JSON
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'API request failed');
        }
        return data;
      } else {
        // If not JSON, read as text (this catches Vercel 500/404 HTML/Text pages)
        const text = await response.text();
        console.error("Server returned non-JSON response:", text);
        // Try to extract a meaningful message from HTML if possible, or just return text
        const errorMessage = text.length < 200 ? text : `Server Error (${response.status}): Check Vercel logs.`;
        throw new Error(errorMessage);
      }

    } catch (error: any) {
      const isLastAttempt = i === retries - 1;
      
      // If it's a rate limit error, we want to retry if possible
      const isRateLimit = error.message.includes('429') || error.message.includes('503') || error.message.includes('busy');
      
      if (isLastAttempt) {
        console.error(`Gemini Service Error (${action}) after ${retries} attempts:`, error);
        throw error;
      }
      
      if (!isRateLimit && i > 0) {
           // For non-rate-limit errors (like 400 Bad Request), don't retry unnecessarily
           throw error;
      }
      
      // Exponential backoff: 3s, 6s, 12s - extended for mobile robustness
      const delay = Math.pow(2, i + 1) * 1500;
      console.warn(`API call failed (${action}), retrying in ${delay}ms...`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

export const analyzeImageOrText = async (
  textInput: string,
  imageBase64?: string
): Promise<{ items: FoodItem[]; clarification?: string }> => {
  try {
    // Longer timeout/retries for analysis as it's critical
    const result = await callApi('analyzeImageOrText', { textInput, imageBase64 }, 3);
    
    // Post-process to add base values for client-side scaling
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
    alert(`Analysis failed: ${error.message}`);
    throw error;
  }
};

export const refineAnalyzedLogs = async (
  currentItems: FoodItem[],
  userInstruction: string
): Promise<{ items: FoodItem[], message: string }> => {
    try {
        const result = await callApi('refineAnalyzedLogs', { currentItems, userInstruction }, 2);
        
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
    const result = await callApi('estimateExerciseCalories', { name, duration, intensity, profile }, 2);
    return { 
        calories: result.calories || 0,
        note: result.note || "" 
    };
  } catch (e: any) {
    // Fallback calculation locally if API fails
    const intensityMultipliers = { low: 4, medium: 8, high: 12 };
    const met = intensityMultipliers[intensity as keyof typeof intensityMultipliers] || 6;
    const estCalories = Math.round((met * 3.5 * profile.weightKg) / 200 * duration);
    return { 
        calories: estCalories, 
        note: `Offline estimate (API unavailable).` 
    }; 
  }
}

export const getPersonalizedAdvice = async (
  logs: LogEntry[],
  profile: UserProfile
): Promise<string> => {
  try {
    const result = await callApi('getPersonalizedAdvice', { logs, profile }, 1); // Less retries for advice
    return result.text;
  } catch (e) {
    console.error("Advice generation failed", e);
    return "Could not generate advice right now. Please try again later.";
  }
};

export const getInstantFeedback = async (
  entry: LogEntry,
  profile: UserProfile
): Promise<string> => {
  try {
    const result = await callApi('getInstantFeedback', { entry, profile }, 1); // 1 try only for feedback
    return result.text;
  } catch (e) {
    throw e; // Throw so UI can handle silent fallback
  }
};

export const chatWithNutritionist = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  context: { profile: UserProfile; logs: LogEntry[] }
) => {
  try {
    const result = await callApi('chatWithNutritionist', { history, message, context }, 2);
    return result.text;
  } catch (error: any) {
    return `Error connecting to assistant: ${error.message}`;
  }
};
