
export enum ContrastMode {
  NORMAL = 'normal',
  DARK = 'dark',
  YELLOW = 'yellow'
}

export interface RecognitionResult {
  text: string;
  crm?: string;
  cro?: string;
  professionalName?: string;
  possibilities?: string[];
  medications: string[];
  summary: string;
  references?: { title: string; uri: string }[]; // Links de busca do Google
}

export interface HistoryItem extends RecognitionResult {
  id: string;
  date: string;
}

export interface AppSettings {
  fontSize: number;
  contrastMode: ContrastMode;
  audioEnabled: boolean;
  zoomLevel: number;
}
