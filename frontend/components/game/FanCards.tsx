'use client';

export default function FanCards({ count }: { count: number }) {
  if (count === 0) return <div className="h-10 w-10" />;

  // Máximo de 5 cartas visíveis no leque
  const visible = Math.min(count, 5);

  // Angulação e deslocamento do leque
  const angleStep = 12;
  const totalAngle = (visible - 1) * angleStep;
  const startAngle = -totalAngle / 2;

  return (
    <div
      className="relative flex items-end justify-center"
      style={{
        width: `${28 + visible * 10}px`,
        height: '52px',
      }}
    >
      {Array.from({ length: visible }).map((_, i) => {
        const angle = startAngle + i * angleStep;
        const translateX = i * 4 - (visible * 2);

        return (
          <div
            key={i}
            className="absolute bottom-0 w-8 h-12 bg-blue-800 border-2 border-blue-600
              rounded-lg flex items-center justify-center shadow-md"
            style={{
              transform: `rotate(${angle}deg) translateX(${translateX}px)`,
              transformOrigin: 'bottom center',
              zIndex: i,
            }}
          >
            <div className="w-5 h-8 border border-blue-500 rounded flex items-center justify-center">
              <span className="text-blue-400 text-xs">🂠</span>
            </div>
          </div>
        );
      })}

      {/* Badge com quantidade se tiver mais de 5 */}
      {count > 5 && (
        <div className="absolute -top-2 -right-2 bg-yellow-400 text-gray-900
          text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center z-10">
          {count}
        </div>
      )}
    </div>
  );
}