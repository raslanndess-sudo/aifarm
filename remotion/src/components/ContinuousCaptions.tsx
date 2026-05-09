import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { WordCaption } from './WordCaption';
import transcriptRu from '../data/transcript-ru.json';

type Word = { word: string; start: number; end: number };

const WORDS = (transcriptRu as { words: Word[] }).words;

const HIGHLIGHT_ROOTS = [
  'клавиатур', 'компьютер', 'usb-c', 'usbc', 'файлы', '1500',
  'omniboard', 'ryzen', 'ssd', 'copilot', 'копилот',
];

const cleanWord = (w: string): string => w.replace(/[.,!?;:«»"—]/g, '').toLowerCase();

const shouldHighlight = (w: string): boolean => {
  const c = cleanWord(w);
  return HIGHLIGHT_ROOTS.some((root) => c.includes(root));
};

const displayWord = (w: string): string =>
  w.replace(/[.,!?;:«»"—]$/g, '').toUpperCase();

type Props = {
  hiddenRanges?: Array<[number, number]>;
};

export const ContinuousCaptions: React.FC<Props> = ({ hiddenRanges = [] }) => {
  const { fps } = useVideoConfig();

  return (
    <>
      {WORDS.map((w, i) => {
        // пропускаем слово если оно полностью в скрытой зоне
        const inHidden = hiddenRanges.some(([a, b]) => w.start >= a && w.end <= b);
        if (inHidden) return null;
        const startFrame = Math.round(w.start * fps);
        const endFrame = Math.round(w.end * fps);
        return (
          <Sequence
            key={`${i}-${startFrame}`}
            from={startFrame}
            durationInFrames={Math.max(1, endFrame - startFrame)}
          >
            <WordCaption word={displayWord(w.word)} highlight={shouldHighlight(w.word)} />
          </Sequence>
        );
      })}
    </>
  );
};
