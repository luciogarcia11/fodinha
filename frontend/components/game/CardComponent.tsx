'use client';

import { motion } from 'framer-motion';
import { Card } from '@/lib/types';
import { SUIT_SYMBOLS, SUIT_COLORS } from '@/lib/cardUtils';

interface CardProps {
  card?: Card;
  hidden?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  disabled?: boolean;
  isWinning?: boolean;
  isTied?: boolean;
}

export default function CardComponent({
  card,
  hidden = false,
  selected = false,
  onClick,
  small = false,
  disabled = false,
  isWinning = false,
  isTied = false,
}: CardProps) {
  const base = small
    ? 'w-12 h-18 rounded text-xs'
    : 'w-16 h-24 rounded-lg text-sm';

  if (hidden || !card) {
    const backIsRed = card?.deckColor === 'red';
    const backBg = backIsRed ? 'bg-red-800 border-red-600' : 'bg-blue-800 border-blue-600';
    const backText = backIsRed ? 'text-red-400' : 'text-blue-400';
    return (
      <motion.div
        className={`${base} ${backBg} border-2 flex items-center justify-center select-none ${onClick && !disabled ? 'cursor-pointer' : 'cursor-default'}`}
        whileHover={onClick && !disabled ? { y: -4 } : {}}
        whileTap={onClick && !disabled ? { scale: 0.97 } : {}}
        onClick={!disabled ? onClick : undefined}
      >
        <span className={`${backText} text-lg`}>🂠</span>
      </motion.div>
    );
  }

  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const suitColor = SUIT_COLORS[card.suit];
  
  const isRedDeck = card.deckColor === 'red';
  const isBlueDeck = card.deckColor === 'blue';

  const defaultBg = isRedDeck ? 'bg-red-50' : (isBlueDeck ? 'bg-blue-50' : 'bg-white');
  const defaultBorder = isRedDeck ? 'border-red-400' : (isBlueDeck ? 'border-blue-400' : 'border-gray-300');

  return (
    <motion.div
      className={`
        ${base} ${defaultBg} border-2 flex flex-col justify-between p-1 select-none relative
        ${selected ? 'border-yellow-400 shadow-yellow-300 shadow-lg' : ''}
        ${isWinning ? 'border-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.7)]' : ''}
        ${isTied ? 'border-dashed border-gray-400 opacity-60' : ''}
        ${!selected && !isWinning && !isTied ? defaultBorder : ''}
        ${onClick && !disabled ? 'cursor-pointer' : 'cursor-default'}
        ${card.isManilha ? 'ring-2 ring-yellow-400' : ''}
        ${small ? 'overflow-hidden' : ''}
      `}
      whileHover={onClick && !disabled ? { y: -8, scale: 1.05 } : {}}
      whileTap={onClick && !disabled ? { scale: 0.97 } : {}}
      animate={
        isWinning
          ? { y: -4, scale: 1.05 }
          : selected
            ? { y: -12 }
            : { y: 0 }
      }
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={!disabled ? onClick : undefined}
    >
      <div className={`font-bold leading-none ${suitColor} ${small ? 'text-[11px]' : 'text-sm'}`}>
        {card.value}
        <br />
        <span>{suitSymbol}</span>
      </div>
      <div className={`text-center font-bold ${suitColor} ${small ? 'text-[15px]' : 'text-xl'}`}>
        {suitSymbol}
      </div>
      <div className={`font-bold leading-none rotate-180 ${suitColor} ${small ? 'text-[11px]' : 'text-sm'}`}>
        {card.value}
        <br />
        <span>{suitSymbol}</span>
      </div>
      {card.isManilha && (
        <div className="absolute top-0 right-0 bg-yellow-400 text-xs rounded-bl px-1 font-bold text-gray-900">
          M
        </div>
      )}
      {isWinning && (
        <div className="absolute -top-1 -left-1 text-[10px]">👑</div>
      )}
    </motion.div>
  );
}