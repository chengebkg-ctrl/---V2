
export interface Word {
  id: string;
  original: string;
  translation: string;
  definitionEn?: string; // English-to-English definition
  phonetic?: string;
  exampleSentence: string;
  stage: number; // 0-10
  createdAt: number;
  nextReviewDate: number;
  lastReviewDate: number;
}

export const REVIEW_INTERVALS = [
  0,                  // Stage 0: Index placeholder
  5 * 1000,           // Stage 1: 5 seconds (Immediate reinforcement)
  5 * 60 * 1000,      // Stage 2: 5 mins
  30 * 60 * 1000,     // Stage 3: 30 mins
  24 * 60 * 60 * 1000,// Stage 4: 1 day
  2 * 24 * 60 * 60 * 1000, // Stage 5: 2 days
  4 * 24 * 60 * 60 * 1000, // Stage 6: 4 days
  7 * 24 * 60 * 60 * 1000, // Stage 7: 7 days
  15 * 24 * 60 * 60 * 1000, // Stage 8: 15 days
  30 * 24 * 60 * 60 * 1000, // Stage 9: 1 month (30 days)
  90 * 24 * 60 * 60 * 1000  // Stage 10: 3 months (90 days)
];

export enum View {
  HOME = 'home',
  REVIEW = 'review',
  LIST = 'list',
  STATS = 'stats'
}
