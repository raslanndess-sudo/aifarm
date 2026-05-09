import React from 'react';

type Props = {
  children: React.ReactNode;
  height?: number;
  top?: number;
};

// Контейнер ограничивает AbsoluteFill детей верхней зоной кадра.
// Для летербокс-шотов где верх чёрный — оверлей ложится ровно туда.
export const TopHalfBox: React.FC<Props> = ({ children, height = 600, top = 0 }) => (
  <div
    style={{
      position: 'absolute',
      top,
      left: 0,
      right: 0,
      height,
      pointerEvents: 'none',
    }}
  >
    {children}
  </div>
);
