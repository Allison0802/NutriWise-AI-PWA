import { GoogleGenAI, Type } from "@google/genai";

// Helper to strip Markdown code blocks from JSON responses
function cleanJSON(text: string | undefined): string {
  if (!text) return "{}";
  let cleaned = text.trim();
  // Remove ```json ... ``` or just ``` ... ``` wrappers
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return cleaned;
}

// Use 'any' for schema to avoid strict type issues during runtime/build mismatches
const foodAnalysisSchema: any = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Name of the food item" },
          quantityAmount: { type: Type.NUMBER, description: "Numeric amount (e.g., 1.5, 100)" },
          quantityUnit: { type: Type.STRING, description: "Unit string (e.g., 'cup', 'grams', 'slice')" },
          calories: { type: Type.NUMBER, description: "Total estimated calories for this amount" },
          protein: { type: Type.NUMBER, description: "Total Protein in grams" },
          carbs: { type: Type.NUMBER, description: "Total Carbs in grams" },
          fat: { type: Type.NUMBER, description: "Total Fat in grams" },
          confidence: { type: Type.STRING, enum: ["high", "medium", "low"], description: "Confidence level of the estimate" },
          notes: { type: Type.STRING, description: "Scientific note or clarification if needed" }
        },
        required: ["name", "quantityAmount", "quantityUnit", "calories", "protein", "carbs", "fat", "confidence"],
      },
    },
    clarificationNeeded: { type: Type.BOOLEAN, description: "True if the AI needs more info to be accurate" },
    clarificationQuestion: { type: Type.STRING, description: "Question to ask the user if clarification is needed" }
  },
  required: ["items", "clarificationNeeded"],
};

const refinementSchema: any = {
  type: Type.OBJECT,
  properties: {
    updatedItems: {
      type: Type.ARRAY,
      items: foodAnalysisSchema.properties!.items!.items!
    },
    assistantResponse: { type: Type.STRING, description: "Conversational response to the user" }
  },
  required: ["updatedItems", "assistantResponse"]
};

export default async function handler(req: any, res: any) {
  // Set CORS headers for Vercel
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  console.log("Gemini API Invoked");

  // CRITICAL: Check for API Key
  if (!process.env.API_KEY) {
    console.error("API_KEY is missing in environment variables.");
    return res.status(500).json({ error: "Server Configuration Error: API_KEY is missing." });
  }

  // Validate Body
  if (!req.body) {
    console.error("Missing request body");
    return res.status(400).json({ error: "Missing request body" });
  }

  try {
    let genAI;
    try {
        genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
    } catch (initError: any) {
        console.error("Failed to initialize GoogleGenAI:", initError);
        return res.status(500).json({ error: `AI Client Init Failed: ${initError.message}` });
    }

    const { action, payload } = req.body;

    console.log(`Processing action: ${action}`);

    if (!action) {
         return res.status(400).json({ error: "Missing action in request body" });
    }

    if (action === 'analyzeImageOrText') {
      const { textInput, imageBase64 } = payload;
      const parts: any[] = [];
      if (imageBase64) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
      }
      const prompt = `
        Analyze the provided food input (image or text). 
        Estimate the nutritional content for each distinct item.
        Prioritize scientific accuracy and standard nutritional databases.
        
        IMPORTANT: Break down quantity into a number and a unit. 
        Example: "2 eggs" -> quantityAmount: 2, quantityUnit: "large eggs".
        Example: "150g Chicken" -> quantityAmount: 150, quantityUnit: "g".
        
        User Description: ${textInput || "No description provided."}
      `;
      parts.push({ text: prompt });

      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: foodAnalysisSchema,
          systemInstruction: "You are a specialized nutritionist AI. Your estimates should be evidence-based. If an image is blurry or ambiguous, mark confidence as low.",
        },
      });
      
      const jsonStr = cleanJSON(response.text);
      return res.status(200).json(JSON.parse(jsonStr));
    }

    if (action === 'refineAnalyzedLogs') {
      const { currentItems, userInstruction } = payload;
      const prompt = `
            Current Food List: ${JSON.stringify(currentItems)}
            User Instruction: "${userInstruction}"

            Update the food list based on the user's instruction.
            - If the user corrects a quantity, update the amount and RECALCULATE calories/macros based on standard data.
            - If the user adds an item, estimate its nutrition.
            - If the user asks a question, answer it in 'assistantResponse' and keep the items unchanged.
            - If the user removes an item, remove it.

            Return the FULL updated list of items.
        `;
      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts: [{ text: prompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: refinementSchema,
        }
      });
      const jsonStr = cleanJSON(response.text);
      return res.status(200).json(JSON.parse(jsonStr));
    }

    if (action === 'estimateExerciseCalories') {
      const { name, duration, intensity, profile } = payload;
      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `
          Estimate the calories burned for this activity/exercise.
          Activity Name: "${name}"
          Duration: ${duration} minutes
          Intensity: ${intensity}
          
          User Physiology:
          - Age: ${profile.age}
          - Gender: ${profile.gender}
          - Weight: ${profile.weightKg}kg
          - Height: ${profile.heightCm}cm

          Instructions:
          1. Identify the likely activity. If "${name}" is not a recognized exercise (e.g. "table", "chair", "nothing"), treat it as sedentary.
          2. Calculate calories based on MET values. 
          3. If input is non-exercise, provide low estimate and set 'note' to explain.
          4. Adjust for user stats.
          
          Output Requirements:
          - calories: Numeric value.
          - note: Short string explanation.
        `,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
               calories: { type: Type.NUMBER },
               note: { type: Type.STRING }
            }
          }
        }
      });
      const jsonStr = cleanJSON(response.text);
      return res.status(200).json(JSON.parse(jsonStr));
    }

    if (action === 'getPersonalizedAdvice') {
      const { logs, profile } = payload;
      const recentLogs = logs.slice(0, 20);
      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `
          Analyze these user logs and profile to find trends and offer body recomposition advice.
          Profile: ${JSON.stringify(profile)}
          Recent Logs: ${JSON.stringify(recentLogs)}
          
          Instructions:
          1. Base advice on stats: Age ${profile.age}, Gender ${profile.gender}, Weight ${profile.weightKg}kg.
          2. EXPLICITLY consider gender-related physiological factors.
          
          Provide a VERY CONCISE summary (max 2 short sentences).
        `,
      });
      return res.status(200).json({ text: response.text || "No advice available." });
    }

    if (action === 'chatWithNutritionist') {
      const { history, message, context } = payload;
      const chat = genAI.chats.create({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: `
            You are a supportive, evidence-based nutritionist assistant.
            Current User Context:
            Profile: ${JSON.stringify(context.profile)}
            Recent Logs (History): ${JSON.stringify(context.logs)}
            
            Answer questions about nutrition, exercise, and the user's data. 
            Be encouraging but scientifically rigorous. 
            Keep responses concise.
            Consider age, gender, and hormonal factors.
          `,
        },
        history: history,
      });

      const result = await chat.sendMessage({ message });
      return res.status(200).json({ text: result.text });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error: any) {
    console.error("API Error details:", error);
    // Return the actual error message so the client knows if it's an API Key issue
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}