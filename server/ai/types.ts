import type { Brand, Network } from '../../shared/types.ts';

export interface TextRequest {
  brand: Brand;
  /** Idea o tema que escribe la persona. */
  brief: string;
  pillar?: string;
  network?: Network;
  variants: number;
}

export interface TextSuggestion {
  text: string;
}

export interface AiProvider {
  id: string;
  label: string;
  /** true = generación real con modelo de IA; false = plantillas locales. */
  isAi: boolean;
  estimateCredits(req: TextRequest): number;
  generateText(req: TextRequest): Promise<TextSuggestion[]>;
}
