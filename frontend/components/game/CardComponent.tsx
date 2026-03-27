'use client';

import { motion } from 'framer-motion';
import { Card } from '@/lib/types';
import { SUIT_SYMBOLS, SUIT_COLORS, isRedSuit } from '@/lib/cardUtils';

interface CardProps {
  card?: Card;
  hidden?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  disabled?: boolean;
}

export default function CardComponent({
  card,
  hidden = false,
  selected = false,
  onClick,
  small = false,
  disabled = false,
}: CardProps) {
  const base = small
    ? 'w-10 h-14 rounded text-xs'
    : 'w-16 h-24 rounded-lg text-sm';

  if (hidden || !card) {
    return (
      <motion.div
        className={`${base} bg-blue-800 border-2 border-blue-600 flex items-center justify-center cursor-default select-none`}
        whileHover={onClick ? { y: -4 } : {}}
      >
        <span className="text-blue-400 text-lg">🂠</span>
      </motion.div>
    );
  }

  const red = isRedSuit(card.suit);
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const suitColor = SUIT_COLORS[card.suit];

  return (
    <motion.div
      className={`
        ${base} bg-white border-2 flex flex-col justify-between p-1 select-none
        ${selected ? 'border-yellow-400 shadow-yellow-300 shadow-lg' : 'border-gray-300'}
        ${onClick && !disabled ? 'cursor-pointer' : 'cursor-default'}
        ${card.isManilha ? 'ring-2 ring-yellow-400' : ''}
      `}
      whileHover={onClick && !disabled ? { y: -8, scale: 1.05 } : {}}
      whileTap={onClick && !disabled ? { scale: 0.97 } : {}}
      animate={selected ? { y: -12 } : { y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={!disabled ? onClick : undefined}
    >
      <div className={`font-bold leading-none ${suitColor} ${small ? 'text-xs' : 'text-sm'}`}>
        {card.value}
        <br />
        <span>{suitSymbol}</span>
      </div>
      <div className={`text-center font-bold ${suitColor} ${small ? 'text-base' : 'text-xl'}`}>
        {suitSymbol}
      </div>
      <div className={`font-bold leading-none rotate-180 ${suitColor} ${small ? 'text-xs' : 'text-sm'}`}>
        {card.value}
        <br />
        <span>{suitSymbol}</span>
      </div>
      {card.isManilha && (
        <div className="absolute top-0 right-0 bg-yellow-400 text-xs rounded-bl px-1 font-bold text-gray-900">
          M
        </div>
      )}
    </motion.div>
  );
}