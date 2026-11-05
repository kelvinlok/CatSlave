export type CostumeSlot = 'headwear' | 'neckwear' | 'footwear';
export const COSTUME_APPEARANCES = ['choco', 'latte', 'didi', 'xiaosai', 'yelo', 'miller', 'momo', 'zhenzhenzi', 'dingding'] as const;
export type CostumeAppearance = typeof COSTUME_APPEARANCES[number];
export type CostumeItemId = 'none' | CostumeAppearance;
export interface CatOutfit { headwear: CostumeItemId; neckwear: CostumeItemId; footwear: CostumeItemId; }
export const COSTUME_SLOTS: readonly { id: CostumeSlot; label: string }[] = [
  { id: 'headwear', label: 'Headwear' }, { id: 'neckwear', label: 'Neck & body' }, { id: 'footwear', label: 'Shoes' },
];
export interface CostumeItem { id: CostumeItemId; label: string; color: string; style?: string; }
const catalog: Record<CostumeAppearance, { color: string; style: string; labels: [string, string, string] }> = {
  choco: { color: '#b62d3c', style: 'santa', labels: ['Santa hat', 'Santa cape', 'Santa boots'] },
  latte: { color: '#285f48', style: 'elf', labels: ['Green elf hat', 'Elf scarf', 'Green elf shoes'] },
  didi: { color: '#ad794e', style: 'reindeer', labels: ['Reindeer antlers', 'Reindeer scarf', 'Reindeer booties'] },
  xiaosai: { color: '#b62d3c', style: 'elf', labels: ['Red elf hat', 'Red elf scarf', 'Red elf shoes'] },
  yelo: { color: '#285f48', style: 'santa', labels: ['Evergreen Santa hat', 'Evergreen cape', 'Evergreen boots'] },
  miller: { color: '#815235', style: 'reindeer', labels: ['Woodland antlers', 'Woodland scarf', 'Woodland booties'] },
  momo: { color: '#527e8c', style: 'winter', labels: ['Winter knit hat', 'Winter scarf', 'Winter slippers'] },
  zhenzhenzi: { color: '#285f48', style: 'holly', labels: ['Holly crown', 'Holly cape', 'Holly slippers'] },
  dingding: { color: '#b62d3c', style: 'gift', labels: ['Christmas bow', 'Gift bow scarf', 'Gift slippers'] },
};
export function isCostumeAppearance(value: unknown): value is CostumeAppearance {
  return typeof value === 'string' && (COSTUME_APPEARANCES as readonly string[]).includes(value);
}
export function isCostumeSlot(value: unknown): value is CostumeSlot { return COSTUME_SLOTS.some(slot => slot.id === value); }
export function isCostumeItemId(value: unknown): value is CostumeItemId { return value === 'none' || isCostumeAppearance(value); }
export function costumeItems(slot: CostumeSlot): CostumeItem[] {
  const index = COSTUME_SLOTS.findIndex(item => item.id === slot);
  if (index < 0) return [];
  return [{ id: 'none', label: 'None', color: '#e8ddca' }, ...COSTUME_APPEARANCES.map(id => ({
    id, label: catalog[id].labels[index], color: catalog[id].color, style: catalog[id].style,
  }))];
}
export function defaultCatOutfit(appearance?: string): CatOutfit {
  const id = isCostumeAppearance(appearance) ? appearance : 'choco';
  return { headwear: id, neckwear: id, footwear: id };
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function isCatOutfit(value: unknown): value is CatOutfit {
  return record(value) && Object.keys(value).length === 3
    && COSTUME_SLOTS.every(({ id }) => isCostumeItemId(value[id]));
}
/** Model boundary: invalid outfits are rejected in favor of the cat's defaults. */
export function normalizeCatOutfit(value: unknown, appearance?: string): CatOutfit {
  return isCatOutfit(value) ? { ...value } : defaultCatOutfit(appearance);
}
export function outfitKey(outfit: CatOutfit) { return `${outfit.headwear}|${outfit.neckwear}|${outfit.footwear}`; }

export interface WardrobeSave { version: 1; outfits: Partial<Record<CostumeAppearance, Partial<CatOutfit>>>; }

/** Strict, bounded parsing; malformed saves cannot partially replace good choices. */
export function parseWardrobe(value: unknown): WardrobeSave | undefined {
  if (typeof value === 'string') {
    if (value.length > 4096) return;
    try { value = JSON.parse(value); } catch { return; }
  }
  if (!record(value) || value.version !== 1 || !record(value.outfits)
    || Object.keys(value).some(key => key !== 'version' && key !== 'outfits')) return;
  const outfits: WardrobeSave['outfits'] = {};
  for (const [appearance, raw] of Object.entries(value.outfits)) {
    if (!isCostumeAppearance(appearance) || !record(raw)
      || Object.entries(raw).some(([slot, item]) => !isCostumeSlot(slot) || !isCostumeItemId(item))) return;
    const changed: Partial<CatOutfit> = {};
    for (const { id } of COSTUME_SLOTS) if (raw[id] !== undefined && raw[id] !== appearance) changed[id] = raw[id] as CostumeItemId;
    if (Object.keys(changed).length) outfits[appearance] = changed;
  }
  return { version: 1, outfits };
}

/** All seasonal pieces are available; only the owning game decides which cats may be dressed. */
export class Wardrobe {
  revision = 0;
  private outfits: WardrobeSave['outfits'] = {};
  get(appearance?: string): CatOutfit {
    return { ...defaultCatOutfit(appearance), ...(isCostumeAppearance(appearance) ? this.outfits[appearance] : undefined) };
  }
  equip(appearance: string, slot: CostumeSlot, item: CostumeItemId): boolean {
    if (!isCostumeAppearance(appearance) || !isCostumeSlot(slot) || !isCostumeItemId(item)
      || this.get(appearance)[slot] === item) return false;
    const changed = { ...this.outfits[appearance] };
    if (item === appearance) delete changed[slot]; else changed[slot] = item;
    if (Object.keys(changed).length) this.outfits[appearance] = changed; else delete this.outfits[appearance];
    this.revision++; return true;
  }
  reset(appearance: string): void {
    if (!isCostumeAppearance(appearance) || !this.outfits[appearance]) return;
    delete this.outfits[appearance]; this.revision++;
  }
  restore(value: unknown): void {
    const parsed = parseWardrobe(value); if (!parsed) return;
    const changed = COSTUME_APPEARANCES.some(appearance => outfitKey(this.get(appearance))
      !== outfitKey({ ...defaultCatOutfit(appearance), ...parsed.outfits[appearance] }));
    if (changed) { this.outfits = parsed.outfits; this.revision++; }
  }
  serialize(): WardrobeSave {
    const outfits: WardrobeSave['outfits'] = {};
    for (const appearance of COSTUME_APPEARANCES) if (this.outfits[appearance]) outfits[appearance] = { ...this.outfits[appearance] };
    return { version: 1, outfits };
  }
}
