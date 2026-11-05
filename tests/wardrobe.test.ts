import { describe, expect, it } from 'vitest';
import { COSTUME_APPEARANCES, COSTUME_SLOTS, Wardrobe, costumeItems, defaultCatOutfit, normalizeCatOutfit, outfitKey, parseWardrobe } from '../src/wardrobe';
import type { CostumeItemId, CostumeSlot } from '../src/wardrobe';

describe('per-cat wardrobe choices', () => {
  it('offers every piece without locks and keeps each cat’s existing default outfit', () => {
    const wardrobe = new Wardrobe();
    for (const { id } of COSTUME_SLOTS) {
      const items = costumeItems(id);
      expect(items.map(item => item.id)).toEqual(['none', ...COSTUME_APPEARANCES]);
      expect(items.every(item => item.label.length && /^#[0-9a-f]{6}$/.test(item.color))).toBe(true);
    }
    for (const appearance of COSTUME_APPEARANCES) expect(wardrobe.get(appearance)).toEqual({ headwear: appearance, neckwear: appearance, footwear: appearance });
    expect(wardrobe.serialize()).toEqual({ version: 1, outfits: {} });
  });

  it('isolates cats, rejects invalid equips, and never exposes mutable saved choices', () => {
    const wardrobe = new Wardrobe();
    expect(wardrobe.equip('choco', 'headwear', 'latte')).toBe(true);
    expect(wardrobe.equip('choco', 'footwear', 'none')).toBe(true);
    expect(wardrobe.get('choco')).toEqual({ headwear: 'latte', neckwear: 'choco', footwear: 'none' });
    expect(wardrobe.get('latte')).toEqual(defaultCatOutfit('latte'));
    const copy = wardrobe.get('choco'); copy.neckwear = 'none';
    const save = wardrobe.serialize(); save.outfits.choco!.headwear = 'none';
    expect(wardrobe.get('choco').headwear).toBe('latte'); expect(wardrobe.get('choco').neckwear).toBe('choco');
    expect(wardrobe.equip('unknown', 'headwear', 'choco')).toBe(false);
    expect(wardrobe.equip('choco', 'tail' as CostumeSlot, 'choco')).toBe(false);
    expect(wardrobe.equip('choco', 'headwear', 'unknown' as CostumeItemId)).toBe(false);
    expect(wardrobe.equip('choco', 'headwear', 'latte')).toBe(false);
    expect(wardrobe.revision).toBe(2);
  });

  it('persists sparse choices, restores a round trip, and resets only one cat', () => {
    const wardrobe = new Wardrobe(); wardrobe.equip('momo', 'headwear', 'didi'); wardrobe.equip('latte', 'neckwear', 'none');
    expect(wardrobe.serialize()).toEqual({ version: 1, outfits: { latte: { neckwear: 'none' }, momo: { headwear: 'didi' } } });
    const loaded = new Wardrobe(); loaded.restore(JSON.stringify(wardrobe.serialize()));
    expect(loaded.revision).toBe(1); expect(loaded.get('momo').headwear).toBe('didi');
    loaded.restore(loaded.serialize()); expect(loaded.revision).toBe(1);
    loaded.reset('momo'); expect(loaded.get('momo')).toEqual(defaultCatOutfit('momo'));
    expect(loaded.get('latte').neckwear).toBe('none');
    loaded.reset('momo'); expect(loaded.revision).toBe(2);
    loaded.equip('latte', 'neckwear', 'latte'); expect(loaded.serialize().outfits).toEqual({});
  });

  it('rejects malformed saves atomically and canonicalizes explicit defaults', () => {
    const wardrobe = new Wardrobe(); wardrobe.equip('choco', 'footwear', 'momo');
    const bad = [null, [], '{broken', { version: 2, outfits: {} }, { version: 1, outfits: [], extra: true },
      { version: 1, outfits: { choco: { headwear: 'none', footwear: 'bad' } } },
      { version: 1, outfits: { unknown: {} } }, { version: 1, outfits: { choco: { tail: 'none' } } },
      { version: 1, outfits: { choco: { headwear: null } } }, { version: 1, outfits: {}, extra: 'no' },
      '{"version":1,"outfits":{"__proto__":{"headwear":"none"}}}', ' '.repeat(4097)];
    for (const value of bad) {
      expect(parseWardrobe(value)).toBeUndefined(); wardrobe.restore(value);
      expect(wardrobe.get('choco').footwear).toBe('momo'); expect(wardrobe.revision).toBe(1);
    }
    expect(parseWardrobe({ version: 1, outfits: { choco: { headwear: 'choco', neckwear: 'none' }, momo: {} } }))
      .toEqual({ version: 1, outfits: { choco: { neckwear: 'none' } } });
  });

  it('normalizes the model boundary without accepting unknown garment identifiers', () => {
    expect(normalizeCatOutfit({ headwear: 'none', neckwear: 'choco', footwear: 'unknown' }, 'latte')).toEqual(defaultCatOutfit('latte'));
    expect(outfitKey({ headwear: 'none', neckwear: 'choco', footwear: 'latte' })).toBe('none|choco|latte');
  });
});
