export enum LessonId {
  INTRO = 'INTRO',
  TILES = 'TILES',
  HAND_STRUCTURE = 'HAND_STRUCTURE',
  ACTIONS = 'ACTIONS',
  SCORE = 'SCORE',
  TIPS = 'TIPS',
  GLOSSARY = 'GLOSSARY',
  GAME = 'GAME'
}

export interface TileData {
  symbol: string;
  name: string;
  type: 'man' | 'pin' | 'sou' | 'wind' | 'dragon';
  value?: number;
}

export interface AiAdvice {
  suggestion: string;
  reason: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';