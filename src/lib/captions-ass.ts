import type { WhisperChunk } from './providers/fal-whisper';

export interface AssOpts {
  chunks: WhisperChunk[];
  resX?: number;
  resY?: number;
  fontName?: string;
  fontSize?: number;
  position?: 'bottom' | 'center' | 'top';
  marginV?: number;
}

/** Convert seconds to ASS time format H:MM:SS.cc */
function toAssTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const wholeSec = Math.floor(s);
  const cs = Math.round((s - wholeSec) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(wholeSec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Escape text for ASS format */
function escapeAss(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\N');
}

function getAlignment(position: 'bottom' | 'center' | 'top'): number {
  // ASS alignment: 1-3 bottom, 4-6 middle, 7-9 top. Center column = 2/5/8
  switch (position) {
    case 'bottom': return 2;
    case 'center': return 5;
    case 'top': return 8;
  }
}

export function buildAssFile(opts: AssOpts): string {
  const resX = opts.resX ?? 1080;
  const resY = opts.resY ?? 1920;
  const fontName = opts.fontName ?? 'Montserrat';
  const position = opts.position ?? 'bottom';
  const alignment = getAlignment(position);
  const marginV = opts.marginV ?? (position === 'bottom' ? 250 : position === 'top' ? 100 : 0);

  // Auto font size based on resolution
  let fontSize = opts.fontSize;
  if (!fontSize) {
    if (resY > resX) fontSize = 80;       // vertical (9:16)
    else if (resY === resX) fontSize = 60; // square (1:1)
    else fontSize = 72;                    // horizontal (16:9)
  }

  const lines: string[] = [];

  // Script Info
  lines.push('[Script Info]');
  lines.push('ScriptType: v4.00+');
  lines.push(`PlayResX: ${resX}`);
  lines.push(`PlayResY: ${resY}`);
  lines.push('ScaledBorderAndShadow: yes');
  lines.push('');

  // Styles
  lines.push('[V4+ Styles]');
  lines.push('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding');
  lines.push(`Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,2,${alignment},20,20,${marginV},1`);
  lines.push('');

  // Events
  lines.push('[Events]');
  lines.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

  for (const chunk of opts.chunks) {
    const text = escapeAss(chunk.text.trim());
    if (!text) continue;
    const start = toAssTime(chunk.timestamp[0]);
    const end = toAssTime(chunk.timestamp[1]);
    lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`);
  }

  return lines.join('\n') + '\n';
}
