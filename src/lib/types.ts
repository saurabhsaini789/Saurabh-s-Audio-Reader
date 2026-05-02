export interface TextChunk {
  id: string;
  pageNumber: number;
  text: string;
  isImportant?: boolean;
}

export interface AppSettings {
  voiceName: string | null;
  rate: number;
  pitch: number;
  volume: number;
  cleanReadingMode: boolean;
}

export interface AppState {
  currentChunkIndex: number;
  lastOpenedFileName: string | null;
}
