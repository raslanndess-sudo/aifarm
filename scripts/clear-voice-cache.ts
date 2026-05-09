// Удаляет всё из public/voice-previews/ — useful если изменили PREVIEW_TEXT
import { promises as fs } from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'public', 'voice-previews');
fs.rm(dir, { recursive: true, force: true }).then(() => console.log('voice cache cleared'));
