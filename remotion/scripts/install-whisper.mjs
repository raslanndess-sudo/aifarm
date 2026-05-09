import { installWhisperCpp, downloadWhisperModel } from '@remotion/install-whisper-cpp';
import path from 'path';

const WHISPER_DIR = path.resolve('A:/claude motage/whisper-cpp');

const to = await installWhisperCpp({
  to: WHISPER_DIR,
  version: '1.8.4',
  printOutput: true,
});

console.log('Installed to:', to);

const { alreadyExisted } = await downloadWhisperModel({
  folder: WHISPER_DIR,
  model: 'small.en',
  printOutput: true,
});

console.log('Model downloaded, already existed:', alreadyExisted);
