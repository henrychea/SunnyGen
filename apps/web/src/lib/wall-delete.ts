export interface GenerationCardLike {
  generation: { id: string }
}

export function uniqueGenerationIds(cards: readonly GenerationCardLike[]): string[] {
  return [...new Set(cards.map((card) => card.generation.id))]
}
