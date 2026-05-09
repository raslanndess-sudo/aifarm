import { Composition } from 'remotion';
import { Main } from './Main';
import { VIDEO } from './videoConfig';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={VIDEO.id}
      component={Main}
      durationInFrames={Math.round(VIDEO.durationSec * VIDEO.fps)}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
    />
  );
};
