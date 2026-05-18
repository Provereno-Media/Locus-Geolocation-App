import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const res = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Where is the Eiffel Tower?",
      config: {
        tools: [{ googleMaps: {} }],
        responseMimeType: "application/json",
        responseSchema: {
            type: "OBJECT",
            properties: {
                loc: { type: "STRING" }
            }
        } as any
      }
    });
    console.log(res.text);
  } catch (e: any) {
    console.error("ERROR:", e.message);
    if (e.status) console.error("Status:", e.status);
    if (e.details) console.error("Details:", e.details);
  }
}

run();
