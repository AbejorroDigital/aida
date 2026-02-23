export type LanguageCode = 'es' | 'en' | 'fr';

export enum ProcessingStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  STREAMING = 'STREAMING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

export interface TranscriptionState {
  text: string;
  status: ProcessingStatus;
  error?: string;
}

export interface AudioInput {
  data: string; // Base64
  mimeType: string;
}