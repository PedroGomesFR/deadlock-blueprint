/**
 * Filtres anti-scintillement pour la détection temps réel (un scan toutes les 350 ms).
 * Une détection n'est prise en compte qu'après avoir été vue plusieurs scans d'affilée,
 * ce qui empêche une frame isolée (écran de mort, animation, portrait masqué) de modifier
 * le héros, les ennemis ou l'inventaire — et donc de faire bouger la liste « À Acheter ».
 */

/** Valide une valeur seulement après `required` scans consécutifs identiques (comparés par `keyOf`). */
export class StableValue<T> {
  private candidateKey: string | null = null;
  private streak = 0;

  constructor(
    private readonly required: number,
    private readonly keyOf: (value: T) => string
  ) {}

  /** Renvoie la valeur dès qu'elle est confirmée (puis à chaque scan identique), sinon `undefined`. */
  push(value: T): T | undefined {
    const key = this.keyOf(value);
    if (key === this.candidateKey) {
      this.streak++;
    } else {
      this.candidateKey = key;
      this.streak = 1;
    }
    return this.streak >= this.required ? value : undefined;
  }

  reset(): void {
    this.candidateKey = null;
    this.streak = 0;
  }
}

/** Confirme un objet d'inventaire seulement s'il est détecté `required` scans d'affilée. */
export class ItemConfirmation {
  private streaks = new Map<string, number>();

  constructor(private readonly required: number) {}

  push(itemIds: string[]): string[] {
    const next = new Map<string, number>();
    for (const id of new Set(itemIds)) {
      next.set(id, (this.streaks.get(id) ?? 0) + 1);
    }
    this.streaks = next;
    return [...next].filter(([, n]) => n >= this.required).map(([id]) => id);
  }

  reset(): void {
    this.streaks.clear();
  }
}

/**
 * Retire un objet possédé seulement s'il manque à un inventaire lisible `required` scans d'affilée
 * (vendu, amélioré, reste d'une partie précédente). Tant que les slots occupés non reconnus suffisent
 * à expliquer tous les absents (objet actif en recharge, icône assombrie), aucune absence n'est comptée.
 */
export class ItemAbsence {
  private streaks = new Map<string, number>();

  constructor(private readonly required: number) {}

  push(ownedIds: string[], seenIds: string[], unmatchedSlots: number): string[] {
    const seen = new Set(seenIds);
    const missing = ownedIds.filter((id) => !seen.has(id));
    if (missing.length <= unmatchedSlots) {
      this.streaks.clear();
      return [];
    }
    const next = new Map<string, number>();
    for (const id of missing) {
      next.set(id, (this.streaks.get(id) ?? 0) + 1);
    }
    this.streaks = next;
    return [...next].filter(([, n]) => n >= this.required).map(([id]) => id);
  }

  reset(): void {
    this.streaks.clear();
  }
}
