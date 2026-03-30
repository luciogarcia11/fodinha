/**
 * Security validation utilities
 */

const MAX_PLAYER_NAME_LENGTH = 16;
const MIN_PLAYER_NAME_LENGTH = 1;
const MAX_CHAT_MESSAGE_LENGTH = 200;
const MAX_ROOM_CODE_LENGTH = 5;
const MIN_ROOM_CODE_LENGTH = 5;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validatePlayerName(name: any): string {
  if (typeof name !== 'string') {
    throw new ValidationError('Nome deve ser uma string');
  }

  const trimmed = name.trim();

  if (trimmed.length < MIN_PLAYER_NAME_LENGTH) {
    throw new ValidationError('Nome é muito curto');
  }

  if (trimmed.length > MAX_PLAYER_NAME_LENGTH) {
    throw new ValidationError('Nome é muito longo (máximo 16 caracteres)');
  }

  // Check for empty or whitespace-only names
  if (!trimmed || /^\s*$/.test(trimmed)) {
    throw new ValidationError('Nome não pode estar vazio');
  }

  // Check for invalid characters (only allow letters, numbers, spaces, and basic punctuation)
  if (!/^[\p{L}\p{N}\s.'_-]+$/u.test(trimmed)) {
    throw new ValidationError('Nome contém caracteres inválidos');
  }

  // Check for profanity filter (basic)
  const profanityList = ['palavrao', 'caralho', 'porra', 'merda', 'foda', 'buceta', 'caralho', 'punheta', 'cu'];
  const lowerName = trimmed.toLowerCase();
  if (profanityList.some(word => lowerName.includes(word))) {
    throw new ValidationError('Nome contém linguagem inapropriada');
  }

  return trimmed;
}

export function validateRoomCode(code: any): string {
  if (typeof code !== 'string') {
    throw new ValidationError('Código da sala deve ser uma string');
  }

  const trimmed = code.trim().toUpperCase();

  if (trimmed.length !== MAX_ROOM_CODE_LENGTH) {
    throw new ValidationError(`Código da sala deve ter ${MAX_ROOM_CODE_LENGTH} caracteres`);
  }

  // Check for alphanumeric only
  if (!/^[A-Z0-9]+$/.test(trimmed)) {
    throw new ValidationError('Código da sala deve conter apenas letras e números');
  }

  return trimmed;
}

export function validateChatMessage(text: any): string {
  if (typeof text !== 'string') {
    throw new ValidationError('Mensagem deve ser uma string');
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('Mensagem não pode estar vazia');
  }

  if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new ValidationError(`Mensagem muito longa (máximo ${MAX_CHAT_MESSAGE_LENGTH} caracteres)`);
  }

  // Sanitize HTML
  const sanitized = trimmed
    .replace(/[<>]/g, c => ({ '<': '&lt;', '>': '&gt;' }[c] ?? c))
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');

  return sanitized;
}

export function validateEmoji(emoji: any): string {
  if (typeof emoji !== 'string') {
    throw new ValidationError('Emoji deve ser uma string');
  }

  if (emoji.length > 4) {
    throw new ValidationError('Emoji inválido');
  }

  // Basic emoji validation (emoji range)
  if (!/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u.test(emoji)) {
    throw new ValidationError('Emoji inválido');
  }

  return emoji;
}

export function validateBet(bet: any, cardsThisRound: number, forbiddenBet: number | null): number {
  const numBet = Number(bet);

  if (isNaN(numBet)) {
    throw new ValidationError('Aposta deve ser um número');
  }

  if (numBet < 0 || numBet > cardsThisRound) {
    throw new ValidationError(`Aposta deve ser entre 0 e ${cardsThisRound}`);
  }

  if (forbiddenBet !== null && numBet === forbiddenBet) {
    throw new ValidationError(`Aposta ${forbiddenBet} não é permitida`);
  }

  return numBet;
}

export function validateCardIndex(cardIndex: any, handLength: number): number {
  const index = Number(cardIndex);

  if (isNaN(index)) {
    throw new ValidationError('Índice da carta deve ser um número');
  }

  if (index < 0 || index >= handLength) {
    throw new ValidationError('Índice da carta inválido');
  }

  return index;
}

export function validateRoomId(roomId: any): string {
  if (typeof roomId !== 'string') {
    throw new ValidationError('ID da sala deve ser uma string');
  }

  const trimmed = roomId.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('ID da sala não pode estar vazio');
  }

  if (trimmed.length > 20) {
    throw new ValidationError('ID da sala muito longo');
  }

  return trimmed;
}

export function validateSessionId(sessionId: any): string {
  if (typeof sessionId !== 'string') {
    throw new ValidationError('ID de sessão deve ser uma string');
  }

  const trimmed = sessionId.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('ID de sessão não pode estar vazio');
  }

  // UUID format validation (basic)
  if (!/^[0-9a-fA-F-]{36}$/.test(trimmed)) {
    throw new ValidationError('ID de sessão inválido');
  }

  return trimmed;
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, c => ({ '<': '&lt;', '>': '&gt;' }[c] ?? c))
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/data:/gi, '')
    .trim()
    .slice(0, 1000); // Prevent extremely long inputs
}
