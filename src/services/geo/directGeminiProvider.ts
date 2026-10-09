import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { DEFAULT_MODEL, getConfig, hasValidKeyChars, isKnownModel, type LocusConfig } from '../config';
import { LocusError, mapGeminiError } from './errors';
import { extractGrounding } from './grounding';
import { buildChatSystemInstruction, buildGeolocationPrompt } from './prompt';
import { parseModelGeolocation } from './schema';
import type {
  AnalyzeImageInput,
  ChatSession,
  GeolocationResult,
  GeoProvider,
  ImageInput,
} from './types';

const MAX_PARSE_ATTEMPTS = 2;

type ProviderConfig = Pick<LocusConfig, 'apiKey' | 'modelName'>;

/**
 * Free tier (ADR-001): the browser calls Gemini directly with the user's own key.
 * Images never pass through Provereno infrastructure.
 */
export class DirectGeminiProvider implements GeoProvider {
  readonly id = 'direct-gemini';

  private client: GoogleGenAI | null = null;
  private clientKey: string | null = null;

  constructor(private readonly readConfig: () => ProviderConfig = getConfig) {}

  async analyzeImage(input: AnalyzeImageInput): Promise<GeolocationResult> {
    const { apiKey, modelName } = this.requireConfig();
    try {
      return await this.runAnalysis(apiKey, modelName, input);
    } catch (error) {
      if (
        error instanceof LocusError &&
        (error.code === 'MODEL_UNAVAILABLE' || error.code === 'MODEL_RETIRED') &&
        modelName !== DEFAULT_MODEL
      ) {
        try {
          const result = await this.runAnalysis(apiKey, DEFAULT_MODEL, input);
          return { ...result, modelFallbackFrom: modelName };
        } catch (fallbackError) {
          throw await this.explainQuota(apiKey, DEFAULT_MODEL, fallbackError);
        }
      }
      throw await this.explainQuota(apiKey, modelName, error);
    }
  }

  /**
   * Some keys (seen with free-tier keys) get 429 only for requests with Search/Maps
   * grounding, while plain requests pass. One plain request tells the two cases apart.
   */
  private async explainQuota(apiKey: string, model: string, error: unknown): Promise<unknown> {
    if (!(error instanceof LocusError) || error.code !== 'QUOTA') return error;
    try {
      await this.getClient(apiKey).models.generateContent({ model, contents: 'ping' });
    } catch {
      return error;
    }
    return new LocusError('GROUNDING_QUOTA', error.detail);
  }

  createChatSession(image: ImageInput, result: GeolocationResult): ChatSession {
    const { apiKey, modelName } = this.requireConfig();
    // Results from old history may name a model that is unknown or withdrawn.
    const chat = this.getClient(apiKey).chats.create({
      model: isKnownModel(result.model) ? result.model : modelName,
      config: {
        systemInstruction: buildChatSystemInstruction(result),
        temperature: 0.3,
      },
    });

    let imageSent = false;

    return {
      async sendMessage(text: string): Promise<string> {
        try {
          const response = imageSent
            ? await chat.sendMessage({ message: text })
            : await chat.sendMessage({
                message: [{ inlineData: { data: image.base64Data, mimeType: image.mimeType } }, { text }],
              });
          imageSent = true;
          return response.text ?? '';
        } catch (error) {
          console.error('Gemini chat request failed', error);
          throw mapGeminiError(error);
        }
      },
    };
  }

  private requireConfig(): ProviderConfig {
    const config = this.readConfig();
    if (!config.apiKey) throw new LocusError('NO_KEY');
    if (!hasValidKeyChars(config.apiKey)) throw new LocusError('BAD_KEY');
    return config;
  }

  private getClient(apiKey: string): GoogleGenAI {
    if (!this.client || this.clientKey !== apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      this.clientKey = apiKey;
    }
    return this.client;
  }

  private async runAnalysis(
    apiKey: string,
    model: string,
    input: AnalyzeImageInput,
  ): Promise<GeolocationResult> {
    let lastError = '';

    for (let attempt = 0; attempt < MAX_PARSE_ATTEMPTS; attempt++) {
      const response = await this.generate(apiKey, model, input);
      const candidate = response.candidates?.[0];
      const text = response.text ?? '';

      if (!text.trim()) {
        throw new LocusError('BLOCKED', `finishReason=${candidate?.finishReason ?? 'none'}`);
      }

      const parsed = parseModelGeolocation(text);
      if (parsed.ok) {
        const grounding = extractGrounding(candidate?.groundingMetadata);
        const { searchQueriesExecuted, ...data } = parsed.data;
        return {
          ...data,
          modelReportedQueries: searchQueriesExecuted,
          groundingQueries: grounding.groundingQueries,
          sources: grounding.sources,
          searchEntryPointHtml: grounding.searchEntryPointHtml,
          model,
          mode: input.mode,
          groundingTool: input.groundingTool,
          analyzedAt: new Date().toISOString(),
        };
      }
      lastError = parsed.error;
      console.warn(`Geolocation response could not be parsed (attempt ${attempt + 1})`, parsed.error);
    }

    throw new LocusError('PARSE', lastError);
  }

  private async generate(
    apiKey: string,
    model: string,
    input: AnalyzeImageInput,
  ): Promise<GenerateContentResponse> {
    try {
      return await this.getClient(apiKey).models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: input.base64Data, mimeType: input.mimeType } },
              { text: buildGeolocationPrompt(input.mode, input.groundingTool) },
            ],
          },
        ],
        config: {
          // A3: JSON mode (responseMimeType) together with Google Maps grounding is not
          // documented as supported. We rely on the prompt plus tolerant parsing and
          // schema validation instead. Re-evaluate after a live test with a real key.
          tools: [input.groundingTool === 'maps' ? { googleMaps: {} } : { googleSearch: {} }],
        },
      });
    } catch (error) {
      console.error('Gemini request failed', error);
      throw mapGeminiError(error);
    }
  }
}
