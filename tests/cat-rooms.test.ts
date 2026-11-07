import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation';
import { PALETTE } from '../src/config';
import { CAT_ROOMS } from '../src/cat-rooms';
import { defaultRoomLayout, DEFAULT_LAYOUT_ENVIRONMENT } from '../src/room-layout';
import { winBonus } from './support/bonus';
import { createNavigationContext, clearFloor, clearFloorSegment } from '../src/room-navigation';
const names = PALETTE.map(cat => cat.name);
function fixture(count = 9) {
  const game = new Game(42); game.restoreFreePlay(names.slice(0,5)); game.restoreAdoptedCats(names.slice(0,count));
  expect(game.startFreePlay()).toBe(true);
  game.cats.forEach(cat => { cat.nextStretchAt = Infinity; cat.decisionAt = Infinity; });
  return game;
}
function settle(game: Game) {
  for (let i = 0; i < 2400 && game.roomTransitions.length; i++) game.tick(.05);
  expect(game.roomTransitions).toHaveLength(0);
}
describe('sleeping rooms', () => {
  it('places inactive unlocked cats in eight stable slots and keeps five active', () => {
    const game = fixture(); expect(game.cats).toHaveLength(5); expect(game.sleepingCats).toHaveLength(4); expect(game.roomSlots).toHaveLength(8);
    game.roomSlots.forEach((cat,i) => { if (cat) { expect(cat.activity).toBe('sleeping'); expect(cat.elevation).toBe(CAT_ROOMS[i].position.height); } });
    expect(game.wakeRoomCat(0)).toBe(false); expect(game.roomTransitions).toHaveLength(0);
  });
  it('walks and hops home before freeing capacity, then wakes with the same identity', () => {
    const game = fixture(), cat = game.cats[0], id = cat.id, origin = { ...cat.position };
    expect(game.sendCatToRoom(id,4)).toBe(true); expect(game.cats).toContain(cat); expect(game.wakeRoomCat(0)).toBe(false);
    expect(game.sendCatToRoom(id,5)).toBe(false);
    let previous = { ...cat.position, elevation: cat.elevation }, sawHop = false;
    for (let i = 0; i < 2400 && game.roomTransitions.length; i++) {
      game.tick(.025);
      expect(Math.hypot(cat.position.x-previous.x,cat.position.z-previous.z,cat.elevation-previous.elevation)).toBeLessThan(.3);
      sawHop ||= cat.elevation > .5; previous = { ...cat.position, elevation: cat.elevation };
    }
    expect(game.roomTransitions).toHaveLength(0); expect(sawHop).toBe(true); expect(cat.position).not.toEqual(origin);
    expect(game.cats).toHaveLength(4); expect(game.sleepingCats).toContain(cat);
    expect(game.wakeRoomCat(4)).toBe(true); expect(game.cats).toHaveLength(5); expect(game.cats.find(c=>c.name===cat.name)?.id).toBe(id);
    expect(game.wakeRoomCat(0)).toBe(false); settle(game); expect(cat.elevation).toBe(0); expect(game.roomSlots[4]).toBeUndefined();
  });
  it('saves settled membership and restores it without unlocking any cat', () => {
    const game = fixture(), before = game.exportCatRooms();
    expect(game.sendCatToRoom(game.cats[0].id,4)).toBe(true); expect(game.exportCatRooms()).toEqual(before); settle(game);
    expect(game.wakeRoomCat(0)).toBe(true); settle(game);
    const saved = game.exportCatRooms(), restored = new Game(4);
    restored.restoreFreePlay(names.slice(0,5)); expect(restored.restoreCatRooms(saved)).toBe(false);
    restored.restoreAdoptedCats(names); expect(restored.restoreCatRooms(saved)).toBe(true); restored.startFreePlay();
    expect(restored.exportCatRooms()).toEqual(saved);
    expect(restored.cats.map(cat=>cat.name)).toEqual(saved!.active);
    expect(restored.restoreCatRooms({version:1,active:names.slice(0,6),rooms:Array(8).fill(null)})).toBe(false);
    expect(restored.restoreCatRooms({version:1,active:[names[0]],rooms:[names[0],...Array(7).fill(null)]})).toBe(false);
  });
  it('freezes transitions while paused and rolls back incomplete actions on restart', () => {
    const game = fixture(), before = game.exportCatRooms(); game.sendCatToRoom(game.cats[0].id,4); game.tick(.5);
    game.pause(); const state = JSON.stringify(game.roomTransitions); game.tick(30); expect(JSON.stringify(game.roomTransitions)).toBe(state);
    expect(game.sendCatToRoom(game.cats[1].id,5)).toBe(false); expect(game.wakeRoomCat(0)).toBe(false);
    game.phase = 'title'; game.startFreePlay(); expect(game.exportCatRooms()).toEqual(before); expect(game.roomTransitions).toHaveLength(0);
  });
  it('rejects the ninth sleeper when all eight rooms are full', () => {
    const game = fixture(); game.phase = 'title';
    expect(game.restoreCatRooms({version:1,active:[names[0]],rooms:names.slice(1)})).toBe(true); game.startFreePlay();
    expect(game.sleepingCats).toHaveLength(8); expect(game.sendCatToRoom(game.cats[0].id)).toBe(false);
  });
  it('finishes an existing furniture visit before heading home', () => {
    const game = fixture(); const cat=game.cats[0]; expect(game.visitFurniture(cat.id,'tree')).toBe(true);
    expect(game.sendCatToRoom(cat.id,4)).toBe(true); expect(cat.visit?.leaveRequested).toBe(true);
    settle(game); expect(game.sleepingCats).toContain(cat); expect(cat.visit).toBeUndefined();
  });
  it('keeps unique stable identities across a campaign restart and new adoption', () => {
    const game = fixture(), ids = new Map([...game.cats, ...game.sleepingCats].map(cat => [cat.name, cat.id]));
    game.reset(); game.cats[0].nextNeedAt = Infinity; game.tick(game.config.duration); winBonus(game);
    expect(game.phase).toBe('adoption'); game.adopt(game.candidates[0].id);
    expect(game.cats.every(cat => cat.id > Math.max(...ids.values()))).toBe(true);
    game.phase = 'title'; game.startFreePlay();
    const residents = [...game.cats, ...game.sleepingCats];
    expect(new Set(residents.map(cat => cat.id)).size).toBe(residents.length);
    for (const cat of residents) expect(cat.id).toBe(ids.get(cat.name));
  });
  it('uses exactly the same supported path in reverse when returning to every room', () => {
    for (let room = 0; room < 8; room++) {
      const game = fixture(5); game.phase = 'title';
      game.restoreCatRooms({version:1,active:names.slice(0,5),rooms:Array(8).fill(null)});game.startFreePlay();
      const cat = game.cats[0];
      expect(game.sendCatToRoom(cat.id,room)).toBe(true);game.tick(.025);
      const move=game.roomTransitions.find(t=>t.catId===cat.id)!;
      const firstSupport=move.route.findIndex(point=>point.height>0);
      const upward=move.route.slice(firstSupport-1).map(point=>({...point}));
      expect(upward.at(-1)).toEqual(CAT_ROOMS[room].position);
      expect(upward.some(point=>point.height===1.62)).toBe(room>=4);
      let sawRise=false;
      for(let step=0;step<2400 && game.roomTransitions.length;step++) {
        const old={...cat.position,height:cat.elevation};game.tick(.025);
        expect(Math.hypot(cat.position.x-old.x,cat.position.z-old.z,cat.elevation-old.height)).toBeLessThan(.3);
        const target=move.route[move.index];
        if(target && target.height>move.from.height) {
          sawRise ||= cat.activity==='jumping' && !!cat.jumpRise;
          if(move.progress<.14) expect(cat.elevation).toBeCloseTo(move.from.height,8);
          if(move.progress>=.82) expect(cat.elevation).toBeCloseTo(target.height,8);
        }
      }
      expect(game.roomTransitions).toHaveLength(0);expect(sawRise).toBe(true);
      expect(cat.jumpRise).toBeUndefined();expect(game.wakeRoomCat(room)).toBe(true);
      const downward=game.roomTransitions.find(t=>t.catId===cat.id)!;
      expect([downward.from,...downward.route]).toEqual(upward.reverse());
      settle(game);expect(cat.elevation).toBe(0);
    }
  });
  it('preserves room access with the legacy furniture arrangement', () => {
    const game=fixture(5);
    game.roomLayout.apply(defaultRoomLayout({...DEFAULT_LAYOUT_ENVIRONMENT,defaultPreset:undefined}));
    const cat=game.cats[0];let crawledUnderTable=false;
    for(const room of [3,7]) {
      expect(game.sendCatToRoom(cat.id,room), `room ${room}: ${game.roomActionError} at ${JSON.stringify(cat.position)}`).toBe(true);
      for(let step=0;step<2400 && game.roomTransitions.length;step++) {
        const old={...cat.position},wasOnFloor=cat.elevation===0;game.tick(.025);
        if(wasOnFloor && cat.elevation===0) {
          expect(clearFloorSegment(old,cat.position,'whole-room',game.roomLayout.navigation)).toBe(true);
          crawledUnderTable ||= cat.activity==='crawling' && !clearFloor(cat.position,'whole-room',game.roomLayout.roomNavigation);
        }
      }
      expect(game.roomTransitions).toHaveLength(0);
      expect(game.wakeRoomCat(room)).toBe(true);settle(game);
      expect(cat.elevation).toBe(0);
    }
    expect(crawledUnderTable).toBe(true);
  });
  it('leaves a containing tabletop footprint without crossing its physical legs', () => {
    const game=fixture(5),cat=game.cats[0];
    const table=game.roomLayout.layout.placed['table-1'];
    cat.position={x:table.x,z:table.z};cat.destination={...cat.position};cat.decisionAt=Infinity;
    expect(clearFloor(cat.position,'whole-room',game.roomLayout.navigation)).toBe(true);
    expect(clearFloor(cat.position,'whole-room',game.roomLayout.roomNavigation)).toBe(false);
    const origin={...cat.position};
    expect(game.sendCatToRoom(cat.id,7)).toBe(true);game.tick(.025);
    const route=game.roomTransitions.find(t=>t.catId===cat.id)!.route;
    expect(clearFloorSegment(origin,route[0],'whole-room',game.roomLayout.navigation)).toBe(true);
    expect(clearFloor(route[0],'whole-room',game.roomLayout.roomNavigation)).toBe(true);
    for(let i=1;i<route.length && route[i].height===0;i++)
      expect(clearFloorSegment(route[i-1],route[i],'whole-room',game.roomLayout.roomNavigation)).toBe(true);
    settle(game);expect(game.sleepingCats).toContain(cat);
  });
  it('uses supported upper ledges and a cabinet stop, while lower rooms jump straight out', () => {
    for (let room = 0; room < 8; room++) {
      const game = fixture(); game.phase = 'title';
      const rooms: (string | null)[] = Array(8).fill(null); rooms[room] = names[1];
      game.restoreCatRooms({ version: 1, active: [names[0]], rooms }); game.startFreePlay();
      const cat = game.roomSlots[room]!;
      expect(game.wakeRoomCat(room)).toBe(true);
      const move = game.roomTransitions.find(t => t.catId === cat.id)!;
      if (room >= 4) {
        expect(move.route.slice(0, 4).map(point=>point.height)).toEqual([
          CAT_ROOMS[room].position.height,CAT_ROOMS[room].position.height,1.62,1.62,
        ]);
        expect(move.route[0].z).toBe(CAT_ROOMS[room].position.z);
        expect(move.route[1].z).toBeGreaterThan(move.route[0].z);
        expect(move.route[2].x).toBeLessThan(move.route[1].x);
      } else {
        expect(move.route.at(-1)!.height).toBe(0);
        expect(move.route.slice(0,-1).every(point=>point.height===CAT_ROOMS[room].position.height)).toBe(true);
        expect(move.route.at(-1)!.x-move.route.at(-2)!.x).toBeGreaterThanOrEqual(.8);
      }
      let landedOnCabinet = false, previousLeg = -1, previousDistance = 0;
      for (let step = 0; step < 2400 && game.roomTransitions.some(t => t.catId === cat.id); step++) {
        const leg = move.index, from = { ...move.from }, target = move.route[leg];
        const old = { ...cat.position, height: cat.elevation };
        game.tick(.025);
        expect(Math.hypot(cat.position.x - old.x, cat.position.z - old.z, cat.elevation - old.height)).toBeLessThan(.3);
        if (target && from.height > target.height && move.index === leg) {
          const travelled = Math.hypot(cat.position.x - from.x, cat.position.z - from.z);
          if (previousLeg === leg) expect(travelled).toBeGreaterThanOrEqual(previousDistance - 1e-9);
          previousLeg = leg; previousDistance = travelled;
          if (move.progress < .14) expect(cat.elevation).toBe(from.height);
          if (move.progress >= .82) expect(cat.elevation).toBeCloseTo(target.height, 8);
          landedOnCabinet ||= target.height === 1.62 && move.progress >= .82;
        }
      }
      expect(game.roomTransitions.some(t => t.catId === cat.id)).toBe(false);
      expect(landedOnCabinet).toBe(room >= 4);
      expect(cat.elevation).toBe(0); expect(cat.jumpDrop).toBeUndefined();
    }
  });
  it('waits on support when a stationary cat blocks every safe landing', () => {
    const game = fixture(); game.phase = 'title';
    game.restoreCatRooms({version:1,active:[names[0]],rooms:names.slice(1)}); game.startFreePlay();
    const blocker = game.cats[0], cat = game.roomSlots[2]!;
    blocker.position = {x:-5.65,z:CAT_ROOMS[2].position.z}; blocker.destination = {...blocker.position}; blocker.decisionAt = Infinity;
    expect(game.wakeRoomCat(2)).toBe(true);
    for(let i=0;i<600;i++) game.tick(.025);
    const waiting=game.roomTransitions.find(t=>t.catId===cat.id)!;
    expect(waiting).toBeDefined();expect(waiting.progress).toBeLessThanOrEqual(.14);
    expect(cat.elevation).toBe(waiting.from.height);
    const support={...cat.position,height:cat.elevation};
    for(let i=0;i<20;i++) game.tick(.025);
    expect({...cat.position,height:cat.elevation}).toEqual(support);
    blocker.position={x:0,z:1.2};blocker.destination={...blocker.position};
    settle(game);expect(cat.elevation).toBe(0);
    expect(Math.hypot(cat.position.x-blocker.position.x, cat.position.z-blocker.position.z)).toBeGreaterThanOrEqual(.7);
  });
  it('does not deadlock when a queued returning cat occupies the waking cat landing', () => {
    const game = fixture(5); game.phase = 'title';
    game.restoreCatRooms({version:1,active:[names[0]],rooms:[names[1],names[2],names[3],names[4],null,null,null,null]}); game.startFreePlay();
    const blocker = game.cats[0], cat = game.roomSlots[2]!;
    blocker.position = {x:-5.65,z:CAT_ROOMS[2].position.z}; blocker.destination = {...blocker.position}; blocker.decisionAt = Infinity;
    expect(game.wakeRoomCat(2)).toBe(true); expect(game.sendCatToRoom(blocker.id,4)).toBe(true);
    expect(game.roomTransitions.find(t=>t.catId===blocker.id)?.phase).toBe('queued');
    settle(game); expect(game.cats).toContain(cat); expect(game.sleepingCats).toContain(blocker);
  });
  it('lets a queued return yield along clear floor when no alternate landing fits', () => {
    const game=fixture(5);game.phase='title';
    game.restoreCatRooms({version:1,active:[names[0]],rooms:[null,names[1],names[2],names[3],names[4],null,null,null]});game.startFreePlay();
    const navigation=createNavigationContext([
      {minX:-7,maxX:-4,minZ:-8,maxZ:-6.65},
      {minX:-4.7,maxX:-4.2,minZ:-5.9,maxZ:-5.3},
      {minX:-5.2,maxX:-4.8,minZ:-6.6,maxZ:-6.15},
      {minX:-5.35,maxX:-4.95,minZ:-4.95,maxZ:-4.5},
    ]);
    game.roomLayout.navigation=navigation;game.roomLayout.roomNavigation=navigation;
    const blocker=game.cats[0],incoming=game.roomSlots[2]!;
    blocker.position={x:-5.15,z:-5.6};blocker.destination={...blocker.position};blocker.decisionAt=Infinity;
    const saved=game.exportCatRooms();
    expect(game.wakeRoomCat(2)).toBe(true);expect(game.sendCatToRoom(blocker.id,0)).toBe(true);
    let yielded=false,clearedLanding=false,previous={...blocker.position};
    for(let i=0;i<2400 && game.roomTransitions.length;i++) {
      const queued=game.roomTransitions.find(t=>t.catId===blocker.id);
      const yielding=queued?.phase==='queued';
      game.tick(.025);
      if(yielding && blocker.elevation===0) {
        expect(clearFloor(blocker.position,'whole-room',navigation)).toBe(true);
        expect(clearFloorSegment(previous,blocker.position,'whole-room',navigation)).toBe(true);
        expect(Math.hypot(blocker.position.x-previous.x,blocker.position.z-previous.z)).toBeLessThan(.025);
        yielded ||= Math.hypot(blocker.position.x+5.15,blocker.position.z+5.6)>.2;
        if(queued?.yieldRoute?.length) expect(game.exportCatRooms()).toEqual(saved);
      }
      previous={...blocker.position};
      if(!clearedLanding && !game.roomTransitions.some(t=>t.catId===incoming.id)) {
        // The constrained fixture has no ordinary roaming space beside the exit.
        // Free the completed arrival's landing for the returning cat.
        incoming.position={x:-3,z:-2};incoming.destination={...incoming.position};incoming.decisionAt=Infinity;clearedLanding=true;
      }
    }
    expect(yielded).toBe(true);expect(game.roomTransitions).toHaveLength(0);
    expect(game.sleepingCats).toContain(blocker);expect(game.cats).toContain(incoming);
    expect(game.roomSlots[0]).toBe(blocker);expect(game.roomSlots[2]).toBeUndefined();
  });
  it('serializes upper shared landings with lower exits in the other column', () => {
    const game=fixture();game.phase='title';game.restoreCatRooms({version:1,active:[names[0]],rooms:names.slice(1)});game.startFreePlay();
    const upper=game.roomSlots[4]!,lower=game.roomSlots[1]!;
    expect(game.wakeRoomCat(4)).toBe(true);expect(game.wakeRoomCat(1)).toBe(true);
    expect(game.roomTransitions.find(t=>t.catId===lower.id)?.phase).toBe('queued');
    for(let i=0;i<2400 && game.roomTransitions.some(t=>t.catId===upper.id);i++) {
      expect(game.roomTransitions.find(t=>t.catId===lower.id)?.phase).toBe('queued');game.tick(.025);
    }
    settle(game);expect(game.roomSlots[4]).toBeUndefined();expect(game.roomSlots[1]).toBeUndefined();
  });
  it('queues opposite lower doors so only one cat uses the shared passage', () => {
    const game=fixture();game.phase='title';game.restoreCatRooms({version:1,active:[names[0]],rooms:names.slice(1)});game.startFreePlay();
    const first=game.roomSlots[0]!,second=game.roomSlots[1]!;
    expect(game.wakeRoomCat(0)).toBe(true);expect(game.wakeRoomCat(1)).toBe(true);
    expect(game.roomTransitions.find(t=>t.catId===second.id)?.phase).toBe('queued');
    expect(game.cats).toContain(first);expect(game.cats).toContain(second);
    for(let i=0;i<2400 && game.roomTransitions.length;i++) {
      expect(game.roomTransitions.filter(t=>t.phase!=='queued')).toHaveLength(1);
      game.tick(.025);
    }
    expect(game.roomTransitions).toHaveLength(0);
    expect(game.roomSlots[0]).toBeUndefined();expect(game.roomSlots[1]).toBeUndefined();
  });
  it('keeps a newly unlocked ninth cat active when eight rooms are occupied', () => {
    const game = fixture(8); game.phase = 'title';
    expect(game.restoreCatRooms({ version: 1, active: [], rooms: names.slice(0,8) })).toBe(true);
    game.restoreAdoptedCats([names[8]]); game.startFreePlay();
    expect(game.cats.map(cat => cat.name)).toEqual([names[8]]);
    expect(game.sleepingCats.map(cat => cat.name)).toEqual(names.slice(0,8));
    expect(new Set([...game.cats,...game.sleepingCats].map(cat => cat.name)).size).toBe(9);
  });
  it('fills an incomplete room save without losing or duplicating unlocked cats', () => {
    const game = fixture(); game.phase = 'title';
    expect(game.restoreCatRooms({ version: 1, active: [], rooms: Array(8).fill(null) })).toBe(true);
    game.startFreePlay();
    const residents = [...game.cats,...game.sleepingCats];
    expect(residents).toHaveLength(9); expect(new Set(residents.map(cat => cat.name))).toEqual(new Set(names));
    expect(game.cats.length).toBeLessThanOrEqual(5); expect(game.sleepingCats.length).toBeLessThanOrEqual(8);
  });
  it('accepts an invitation below capacity while another cat returns through the same doorway', () => {
    const game = fixture(); game.sendCatToRoom(game.cats[0].id,4); settle(game);
    expect(game.cats).toHaveLength(4);
    const returning = game.cats[0], invited = game.roomSlots[1]!;
    expect(game.sendCatToRoom(returning.id,5)).toBe(true);
    const before = { ...invited.position, elevation: invited.elevation };
    expect(game.wakeRoomCat(1)).toBe(true); expect(game.roomActionError).toBe('');
    expect(game.roomTransitions.find(t => t.catId === invited.id)?.phase).toBe('queued');
    expect(game.cats).toHaveLength(5); game.tick(.1);
    expect({ ...invited.position, elevation: invited.elevation }).toEqual(before);
    expect(game.wakeRoomCat(0)).toBe(false); expect(game.roomActionError).toBe('The lounge already has 5 cats.');
    settle(game); expect(game.sleepingCats).toContain(returning); expect(game.cats).toContain(invited);
    expect(invited.elevation).toBe(0); expect(game.cats).toHaveLength(4);
  });
  it('runs queued invitations in order, reserves all capacity, and pauses without changing saves', () => {
    const game = fixture(); game.phase = 'title';
    game.restoreCatRooms({version:1,active:[names[0]],rooms:names.slice(1)}); game.startFreePlay();
    const before = game.exportCatRooms(), first = game.roomSlots[0]!, queued = game.roomSlots[2]!;
    expect(game.wakeRoomCat(0)).toBe(true); expect(game.wakeRoomCat(2)).toBe(true);
    expect(game.wakeRoomCat(4)).toBe(true); expect(game.wakeRoomCat(5)).toBe(true);
    expect(game.cats).toHaveLength(5); expect(game.wakeRoomCat(3)).toBe(false);
    expect(game.roomTransitions.find(t=>t.catId===queued.id)?.phase).toBe('queued');
    game.pause(); const snapshot = JSON.stringify(game.roomTransitions); game.tick(20);
    expect(JSON.stringify(game.roomTransitions)).toBe(snapshot); expect(game.exportCatRooms()).toEqual(before);
    game.resume();
    for (let i=0;i<2400 && game.roomTransitions.some(t=>t.catId===first.id);i++) {
      expect(game.roomTransitions.find(t=>t.catId===queued.id)?.phase).toBe('queued'); game.tick(.025);
    }
    settle(game); expect(game.cats).toHaveLength(5);
    for (const index of [0,2,4,5]) expect(game.roomSlots[index]).toBeUndefined();
  });
  it('explains obstructed room access without reserving a lounge place', () => {
    const game = fixture(); game.phase = 'title';
    game.restoreCatRooms({version:1,active:[names[0]],rooms:names.slice(1)}); game.startFreePlay();
    const original = game.exportCatRooms();
    game.roomLayout.navigation = game.roomLayout.roomNavigation = createNavigationContext([{minX:-8,maxX:0,minZ:-8,maxZ:-4}]);
    expect(game.wakeRoomCat(0)).toBe(false);
    expect(game.roomActionError).toBe('Clear the space in front of the cat rooms first.');
    expect(game.cats).toHaveLength(1); expect(game.roomTransitions).toHaveLength(0); expect(game.exportCatRooms()).toEqual(original);
  });
  it('restarts a queued request from its settled membership rather than duplicating its reservation', () => {
    const game = fixture(); game.phase='title';
    game.restoreCatRooms({version:1,active:[names[0]],rooms:names.slice(1)}); game.startFreePlay();
    const before=game.exportCatRooms(); game.wakeRoomCat(0);game.wakeRoomCat(2);game.tick(.2);
    game.phase='title';game.startFreePlay();
    expect(game.exportCatRooms()).toEqual(before);expect(game.cats).toHaveLength(1);expect(game.sleepingCats).toHaveLength(8);
    expect(game.roomTransitions).toHaveLength(0);
  });
});
