import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface GeolocationResult {
  locationName: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  confidence: number;
  evidence: string[];
  description: string;
  extractedText?: string[];
  identifiedSymbols?: string[];
  searchQueriesExecuted?: string[];
  sources?: { uri: string; title: string; type: 'web' | 'maps' }[];
  searchEntryPointHtml?: string;
}

export interface ChatSession {
  sendMessage(text: string): Promise<string>;
}

export function createOsintChatSession(base64Data: string, mimeType: string, result: GeolocationResult): ChatSession {
  const model = "gemini-2.5-flash";

  const systemInstruction = `You are a specialized OSINT (Open Source Intelligence) assistant called "LOCUS" embedded in an analytical engine. 
The system engine has already processed an image provided by the user with the following findings:
- Estimated Location: ${result.locationName}
- Coordinates: ${result.coordinates.lat.toFixed(4)}, ${result.coordinates.lng.toFixed(4)}
- Confidence Score: ${(result.confidence * 100).toFixed(1)}%
- System Heuristic Summary: ${result.description}
- Identifiable Evidentiary Features: ${result.evidence.join('; ')}

Your task is to answer user questions about this image and the system's conclusions.
When appropriate, carefully reference specific details like architectural styles, language/text, infrastructure variants (e.g. road lines, poles), and environmental clues (flora, terrain, shadow angles).
Provide concise, expert, and precise answers. Maintain a professional, detached, and slightly clinical "intelligence analyst" persona.`;

  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.3,
    }
  });

  let isFirstMessage = true;

  return {
    async sendMessage(text: string): Promise<string> {
      try {
        let response;
        if (isFirstMessage) {
          isFirstMessage = false;
          response = await chat.sendMessage({
            message: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType,
                },
              },
              { text: text }
            ]
          });
        } else {
          response = await chat.sendMessage({ message: text });
        }
        return response.text || "";
      } catch (error) {
        console.error("Chat error:", error);
        throw new Error("Chat system failed to respond.");
      }
    }
  };
}

export type AnalysisMode = 'visual' | 'satellite' | 'flora';

export async function geolocateImage(base64Data: string, mimeType: string, mode: AnalysisMode = 'visual', groundingTool: 'search' | 'maps' = 'maps'): Promise<GeolocationResult> {
  const model = "gemini-2.5-pro"; // Upgraded to Pro for state-of-the-art OCR and reasoning in challenging conditions

  let prompt = `Act as an expert OSINT (Open Source Intelligence) analyst specializing in image geolocation.
  Your goal is to determine the precise geographic location shown in the image by following a rigorous evidence-based workflow. Tone should be neutral, skeptical, and strictly evidence-based.
  Crucial Rule: Do NOT speculate beyond what is visually confirmed in the image. If a feature is not present, explicitly state "Not visible" or use null. Do not guess coordinates unless the location contains verifiable landmarks.
  
  Meticulously perform the following steps:
  1. DEDICATED OCR & SYMBOL PASS (EXTREME ATTENTION TO DETAIL REQUIRED):
     - Scan the entire image for text, meticulously analyzing challenging areas with low light, glare, motion blur, steep angles, or extremely small font sizes in the far background.
     - Use structural and contextual clues to reconstruct partially obscured, degraded, or ambiguous text.
     - Transcribe ALL readable text exactly in its original script. Translate to English in brackets.
     - Analyze FONT STYLES and TYPOGRAPHICAL CONVENTIONS (e.g., European vs. American date formats, specific road sign fonts like Transport vs. FHWA).
     - Identify all symbols (corporate branding, crests, political stickers, infrastructure iconography).
     
  2. VISUAL EXTRACTION: Identify every significant detail:
     - LANDMARKS & ARCHITECTURE: Identifiable buildings, architectural styles (e.g., brutalism, Ottoman, Haussmann), window frame types, balcony and roof designs characteristic of specific countries or periods.
     - LANDSCAPE & ENVIRONMENT: Terrain, vegetation (e.g., taiga, tropical, steppe), bodies of water, soil type.
     - BIOLOGICAL INDICATORS: Visible plant species or animals. Note whether they are endemic or exotic.
     - VEHICLES: Make/model, license plate details (color scheme, format, readable text), steering wheel position (LHD/RHD).
     - INFRASTRUCTURE: Road markings (e.g., yellow vs. white lines), traffic signs, utility pole shapes, power line configurations, street signs, infrastructure symbols. Mobile operator branding or telephone booth colors if visible.
     - LIGHTING ANALYSIS: Sun azimuth (left/right/behind camera), shadow direction and length, estimated time of day, visible season indicators (snow, foliage, dry grass).
     - HUMAN INDICATORS: Clothing styles, visible uniforms, military or police insignia, logos on clothing or equipment.
  
  3. EXPLICIT MULTI-QUERY GROUNDING & VERIFICATION:
     - Generate and execute *multiple* specific search queries. Do not rely on just one attempt.
     - Generate queries that combine elements (e.g., ["exact extracted text" + "suspected city name", "phone number", "unique symbol description"]).
     - Translate detected words to English for generic searches, AND search the local language directly on maps.
     - Use ${groundingTool === 'maps' ? 'the Google Maps tool' : 'Google Search'} to thoroughly query these features. 
     - Verify if the architectural style, infrastructure, and vegetation match the suspected region.
  
  4. CHAIN OF THOUGHT & DEDUCTION: 
     - Broad region hypothesis: Deduce the broad region (e.g., "Left-hand traffic and tropical vegetation suggest Southeast Asia...").
     - Country/City narrowing: Narrow down the country and city based on language, architecture, and infrastructure. Cross-reference all clues to achieve street-level precision if possible.
     - Conflicting clues: Explicitly list any cues that contradict the main hypothesis and explain how you resolve the conflict.
     - Eliminated hypotheses: List alternative countries/regions you considered and the reason each was eliminated.
  
  MODE FOCUS: ${mode === 'satellite' ? ' structural layout, road networks, and topography from an overhead view' : mode === 'flora' ? 'botanical signatures, biomes, and climate zones' : 'general visual cues'}.
  
  You MUST respond ONLY with a valid JSON object matching this structure exactly:
  {
    "locationName": "Precise name (e.g. 123 Main St, Berlin, Germany)",
    "coordinates": { "lat": number, "lng": number },
    "confidence": 0-1,
    "extractedText": ["Literal Text [English Translation] (Font/Style analysis)"],
    "identifiedSymbols": ["Description of symbol"],
    "searchQueriesExecuted": ["Query 1", "Query 2"],
    "evidence": ["e.g. Utility pole design matches Polish Standard...", "e.g. Text is Cyrillic, likely Ukrainian..."],
    "description": "A detailed step-by-step reasoning of how you arrived at this location, including broad region hypothesis, verification searches steps, resolution of conflicting clues, and why alternative regions were eliminated."
  }`;

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        tools: [groundingTool === 'maps' ? { googleMaps: { enableWidget: true } } : { googleSearch: {} }],
      },
    });
  } catch (error: any) {
    console.error("Gemini API Error details:", error);
    const errorMessage = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    throw new Error(`Failed to call the Gemini API: ${errorMessage}. Model: ${model}, Tool: ${groundingTool}`);
  }

  try {
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Extract JSON from the text response (it might be wrapped in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not find JSON in response: " + text);
    }
    
    const result = JSON.parse(jsonMatch[0]) as GeolocationResult;
    
    // Extract grounding entry point (Web Search HTML widget)
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.searchEntryPoint?.renderedContent) {
      result.searchEntryPointHtml = groundingMetadata.searchEntryPoint.renderedContent;
    } else if (groundingMetadata?.googleMapsWidgetContextToken) {
      // Actually, how to render this token? For now, we will store it, although we might not use it directly without a specific JS library.
      // E.g., we could pass it to the UI and if there's a specialized map widget, use it.
      // But since we are asked just to test Google Maps Grounding, making the code robust is priority.
    }
    
    // Extract grounding sources if available (Web and Maps)
    const groundingChunks = groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      const sources: { uri: string; title: string; type: 'web' | 'maps' }[] = [];
      
      groundingChunks.forEach(chunk => {
        if (chunk.web) {
          sources.push({
            uri: chunk.web.uri || '',
            title: chunk.web.title || 'Web Search Link',
            type: 'web'
          });
        }
        if (chunk.maps) {
          sources.push({
            uri: (chunk.maps as any).uri || '', // Use any to avoid type check issues if uri isn't in definition
            title: (chunk.maps as any).title || 'Google Maps Location',
            type: 'maps'
          });
        }
      });

      result.sources = sources;
    }
    
    return result;
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    throw new Error("Could not analyze the image correctly. The AI reached a conclusion but failed to format it as requested.");
  }
}
