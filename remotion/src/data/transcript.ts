import transcriptJson from './transcript.json';

export type Word = {
  word: string;
  start: number;
  end: number;
  prob: number;
};

export type Transcript = {
  language: string;
  duration: number;
  words: Word[];
};

export const TRANSCRIPT = transcriptJson as Transcript;
