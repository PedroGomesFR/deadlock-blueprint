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
 * Vote par slot, sur toute la partie, pour les 6 portraits d'une équipe. Un héros garde son slot toute la partie,
 * mais une image isolée le lit souvent mal (chrono de réapparition, bannière rouge de PV critiques, surlignage,
 * héros absent du catalogue) : sur les parties enregistrées, le bon héros était majoritaire dans chaque slot alors
 * que la composition « 4 scans identiques » changeait toutes les quelques secondes. Les votes sont gardés jusqu'à
 * `reset()` (nouvelle partie) : un héros mort (portrait illisible) ne vote plus mais garde son slot.
 */
export class SlotVoter {
  private counts: Map<string, number>[];

  constructor(
    private readonly slotCount = 6,
    private readonly minVotes = 3,
    private readonly minShare = 0.35
  ) {
    this.counts = Array.from({ length: slotCount }, () => new Map());
  }

  push(readings: (string | null | undefined)[]): void {
    for (let i = 0; i < this.slotCount; i++) {
      const id = readings[i];
      if (id) this.counts[i].set(id, (this.counts[i].get(id) ?? 0) + 1);
    }
  }

  /**
   * Héros de chaque slot : le plus voté (au moins `minVotes` votes et `minShare` des votes du slot), chaque héros
   * dans un seul slot (celui où il a le plus de votes).
   */
  result(): (string | null)[] {
    const candidates: { slot: number; id: string; votes: number }[] = [];
    this.counts.forEach((counts, slot) => {
      let total = 0;
      counts.forEach((n) => (total += n));
      counts.forEach((votes, id) => {
        if (votes >= this.minVotes && votes >= total * this.minShare) candidates.push({ slot, id, votes });
      });
    });
    candidates.sort((a, b) => b.votes - a.votes || a.slot - b.slot || a.id.localeCompare(b.id));
    const out: (string | null)[] = new Array(this.slotCount).fill(null);
    const used = new Set<string>();
    for (const c of candidates) {
      if (out[c.slot] !== null || used.has(c.id)) continue;
      out[c.slot] = c.id;
      used.add(c.id);
    }
    return out;
  }

  get isEmpty(): boolean {
    return this.counts.every((c) => c.size === 0);
  }

  reset(): void {
    this.counts.forEach((c) => c.clear());
  }
}

/**
 * Retire un objet possédé seulement s'il manque à un inventaire lisible `required` scans d'affilée
 * (vendu, amélioré, reste d'une partie précédente). Tant que les slots occupés non reconnus suffisent
 * à expliquer tous les absents (objet actif en recharge, icône assombrie), aucune absence n'est comptée.
 * Une vente ou une amélioration ne retire qu'un objet à la fois : quand `manyFrom` objets ou plus manquent
 * ensemble (écran de transition, inventaire d'un autre joueur), il faut `requiredWhenMany` scans.
 */
export class ItemAbsence {
  private streaks = new Map<string, number>();

  constructor(
    private readonly required: number,
    private readonly requiredWhenMany = required,
    private readonly manyFrom = Infinity
  ) {}

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
    const required = missing.length - unmatchedSlots >= this.manyFrom ? this.requiredWhenMany : this.required;
    return [...next].filter(([, n]) => n >= required).map(([id]) => id);
  }

  reset(): void {
    this.streaks.clear();
  }
}
