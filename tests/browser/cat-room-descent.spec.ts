import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Mesh, SkinnedMesh } from 'three';

test.use({ deviceScaleFactor: 1, viewport: { width: 480, height: 720 } });
test.setTimeout(300_000);

test('native cat descends upper and lower bedrooms forward and lands on support surfaces', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('catslave-language', 'en');
    localStorage.setItem('catslave-free-play', JSON.stringify(['Choco', 'Latte', '的的', '小塞', 'Yelo']));
    localStorage.setItem('catslave-wardrobe', JSON.stringify({ version: 1, outfits: { choco: { headwear: 'none', neckwear: 'none', footwear: 'none' } } }));
  });
  await page.route('**/models/**', route => /(?:lounge|christmas-tree|christmas-wall-decor|choco)\.glb/.test(route.request().url()) ? route.continue() : route.abort());
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__?.world.roomRoot.userData.loaded);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));

  for (const scenario of [{ name: 'upper', room: 7 }, { name: 'lower', room: 3 }].filter(item => !process.env.CAT_DESCENT_CASE || item.name === process.env.CAT_DESCENT_CASE)) {
    const floorOnly = !!process.env.CAT_DESCENT_FLOOR_ONLY;
    const folder = `artifacts/cat-room-descent/${scenario.name}${floorOnly ? '-floor' : ''}`; await mkdir(folder, { recursive: true });
    const catId = await page.evaluate(room => {
      const t = window.__CATSLAVE_TEST__, rooms = Array(8).fill(null); rooms[room] = 'Choco';
      t.game.phase = 'title';
      if (!t.game.restoreCatRooms({ version: 1, active: ['Latte'], rooms })) throw new Error('Cannot seed descent');
      t.game.startFreePlay(); t.game.cats.forEach(cat => cat.decisionAt = Infinity); t.refresh();
      return t.game.roomSlots[room]!.id;
    }, scenario.room);
    await page.waitForFunction(id => window.__CATSLAVE_TEST__.world.scene.children.find(root => root.userData.catId === id)?.userData.modelSource === 'blender', catId);
    const route = await page.evaluate(room => {
      const t = window.__CATSLAVE_TEST__; if (!t.game.wakeRoomCat(room)) throw new Error(t.game.roomActionError);
      return structuredClone(t.game.roomTransitions.find(move => move.roomIndex === room)!);
    }, scenario.room);
    if (scenario.name === 'upper') expect(route.route.some(point => Math.abs(point.height - 1.62) < .001 && Math.abs(point.x + 6.65) < .001)).toBe(true);
    else expect(route.route.every(point => point.height <= 1.38)).toBe(true);
    const frames: { label: string; data: string }[] = [];
    const samples: Record<string, unknown>[] = [];
    let previousKey = '', complete = false;
    for (let frame = 0; frame < 48 && !complete; frame++) {
      const result = await page.evaluate(({ id, previousKey, floorOnly }) => {
        const t = window.__CATSLAVE_TEST__;
        const measurements: { x: number; y: number; z: number; yaw: number; activity: string; pose: number; drop: number; index: number; progress: number; from: { x: number; z: number; height: number } | null; target: { x: number; z: number; height: number } | null }[] = [];
        let key = previousKey;
        for (let step = 0; step < 2400; step++) {
          const cat = t.game.cats.find(cat => cat.id === id)!;
          const move = t.game.roomTransitions.find(move => move.catId === id);
          key = move ? `${move.index}:${Math.floor(move.progress * 4)}` : 'done';
          if (key !== previousKey) break;
          t.game.tick(.025);
          const next = t.game.roomTransitions.find(move => move.catId === id);
          measurements.push({ x: cat.position.x, y: cat.elevation, z: cat.position.z, yaw: cat.yaw, activity: cat.activity,
            pose: cat.pose, drop: cat.jumpDrop ?? 0, index: next?.index ?? -1, progress: next?.progress ?? 1,
            from: next ? { ...next.from } : null, target: next?.route[next.index] ? { ...next.route[next.index] } : null });
          if (step % 4 === 0) t.refresh();
        }
        t.refresh(); const cat = t.game.cats.find(cat => cat.id === id)!;
        // Keep paws and adjacent support geometry legible throughout the trip.
        t.world.camera.fov = 48; t.world.camera.updateProjectionMatrix();
        t.world.camera.position.set(cat.position.x + 3.5, Math.min(4.65, cat.elevation + 1.8), cat.position.z + 2.2);
        t.world.camera.lookAt(cat.position.x - .15, cat.elevation + .45, cat.position.z - .05);
        const move = t.game.roomTransitions.find(move => move.catId === id);
        return { key, measurements, complete: key === 'done', y: cat.elevation, activity: cat.activity, drop: cat.jumpDrop ?? 0,
          image: !floorOnly || !move || move.index === move.route.length - 1 ? t.captureFrame() : '', label: `t=${t.game.clock.toFixed(2)}  ${key}  y=${cat.elevation.toFixed(2)}` };
      }, { id: catId, previousKey, floorOnly });
      expect(result.key).not.toBe(previousKey); previousKey = result.key; complete = result.complete;
      samples.push(...result.measurements);
      if (result.image) {
        frames.push({ label: result.label, data: result.image });
        await writeFile(`${folder}/frame-${String(frame).padStart(2, '0')}.png`, Buffer.from(result.image.split(',')[1], 'base64'));
      }
      if (complete) { expect(result.y).toBe(0); expect(result.drop).toBe(0); expect(result.activity).toBe('idle'); }
    }
    expect(complete).toBe(true);
    const motion = samples as { x: number; y: number; z: number; yaw: number; activity: string; pose: number; drop: number; index: number; progress: number; from: { x: number; z: number; height: number } | null; target: { x: number; z: number; height: number } | null }[];
    expect(motion.every(sample => [sample.x, sample.y, sample.z, sample.drop].every(Number.isFinite))).toBe(true);
    const drops = motion.filter(sample => sample.activity === 'jumping' && sample.target && sample.from && sample.target.height < sample.from.height && sample.pose > .14 && sample.pose < .82);
    expect(drops.length).toBeGreaterThan(3); expect(drops.every(sample => sample.drop > 0)).toBe(true);
    for (let i = 1; i < motion.length; i++) {
      const a = motion[i - 1], b = motion[i];
      if (a.index !== b.index || b.activity !== 'jumping' || b.pose <= .14 || b.pose >= .82) continue;
      const forward = (b.x - a.x) * Math.sin(b.yaw) + (b.z - a.z) * Math.cos(b.yaw);
      expect(forward, `backward airborne motion at ${scenario.name} leg ${b.index}`).toBeGreaterThanOrEqual(-.001);
    }
    await writeFile(`${folder}/motion.json`, JSON.stringify({ route, samples }, null, 2));
    const sheet = await page.evaluate(async frames => {
      const width = 240, height = 380, columns = 4;
      const canvas = document.createElement('canvas'); canvas.width = width * columns; canvas.height = height * Math.ceil(frames.length / columns);
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < frames.length; i++) {
        const img = new Image(); img.src = frames[i].data; await img.decode();
        const x = i % columns * width, y = Math.floor(i / columns) * height;
        ctx.drawImage(img, x, y + 20, width, height - 20); ctx.fillStyle = '#172e27'; ctx.font = '12px sans-serif'; ctx.fillText(frames[i].label, x + 4, y + 14);
      }
      return canvas.toDataURL('image/png');
    }, frames);
    await writeFile(`${folder}/contact-sheet.png`, Buffer.from(sheet.split(',')[1], 'base64'));
  }
  expect(errors).toEqual([]);
});

test('native head and body clear the mural tabletop throughout upper and lower descents', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('catslave-free-play', JSON.stringify(['Choco', 'Latte', '的的', '小塞', 'Yelo']));
    localStorage.setItem('catslave-wardrobe', JSON.stringify({ version: 1, outfits: { choco: { headwear: 'none', neckwear: 'none', footwear: 'none' } } }));
  });
  await page.route('**/models/**', route => /(?:lounge|christmas-tree|christmas-wall-decor|choco)\.glb/.test(route.request().url()) ? route.continue() : route.abort());
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__?.world.roomRoot.userData.loaded);
  const allMetrics = [];
  for (const room of [7, 3]) {
    const id = await page.evaluate(room => {
      const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.phase = 'title';
      const rooms = Array(8).fill(null); rooms[room] = 'Choco';
      t.game.restoreCatRooms({ version: 1, active: ['Latte'], rooms });
      t.game.startFreePlay(); t.game.cats.forEach(cat => cat.decisionAt = Infinity); t.refresh(); return t.game.roomSlots[room]!.id;
    }, room);
    await page.waitForFunction(id => window.__CATSLAVE_TEST__.world.scene.children.find(root => root.userData.catId === id)?.userData.modelSource === 'blender', id);
    const metrics = await page.evaluate(({ id, room }) => {
      const t = window.__CATSLAVE_TEST__; if (!t.game.wakeRoomCat(room)) throw new Error(t.game.roomActionError);
      const root = t.world.scene.children.find(root => root.userData.catId === id)!, table = t.world.roomRoot.getObjectByName('furniture:table-1')!;
      table.updateWorldMatrix(true, true);
      const vertex = t.world.camera.position.clone(), tablePoints: number[][] = [], triangles: number[][][] = [];
      table.traverse(object => { const mesh = object as Mesh; if (!mesh.isMesh) return;
        const points: number[][] = [];
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) { mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld); points.push(vertex.toArray()); }
        tablePoints.push(...points); const index = mesh.geometry.index;
        for (let i = 0; i < (index?.count ?? points.length); i += 3) triangles.push([0,1,2].map(j => points[index ? index.getX(i+j) : i+j]));
      });
      const top = Math.max(...tablePoints.map(p => p[1])), surface = tablePoints.filter(p => p[1] >= top - .13);
      const topFaces = triangles.filter(face => face.every(p => p[1] >= top - .13));
      const box = { minX: Math.min(...surface.map(p => p[0])), maxX: Math.max(...surface.map(p => p[0])), minY: top - .13, maxY: top,
        minZ: Math.min(...surface.map(p => p[2])), maxZ: Math.max(...surface.map(p => p[2])) };
      const onTable = (x: number, z: number) => topFaces.some(([a,b,c]) => {
        const d = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]); if (Math.abs(d)<1e-10) return false;
        const u = ((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d;
        const v = ((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
        return u>=0 && v>=0 && u+v<=1;
      });
      const skins: { mesh: SkinnedMesh; indices: { index: number; role: string }[] }[] = [];
      root.traverse(object => { const mesh = object as SkinnedMesh; if (!mesh.isSkinnedMesh || !mesh.visible) return;
        const indices: { index: number; role: string }[] = [], si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) for (const c of ['X','Y','Z','W'] as const) {
          const bone = mesh.skeleton.bones[si[`get${c}`](i)];
          if (sw[`get${c}`](i) > .5 && /DEF_(head|body)/.test(bone?.name ?? '')) indices.push({ index: i, role: bone.name });
        }
        skins.push({ mesh, indices });
      });
      const samples = []; let previous = '';
      for (let step = 0; step < 2400; step++) {
        t.game.tick(.01); t.refresh();
        const cat = t.game.cats.find(cat => cat.id === id)!, move = t.game.roomTransitions.find(move => move.catId === id);
        const key = move ? `${move.index}:${Math.floor(move.progress*10)}` : 'done';
        if (key === previous) continue; previous = key; root.updateWorldMatrix(true, true);
        const bounds: Record<string, { min: number[]; max: number[]; inside: number; dividerInside: number; vertices: number }> = {};
        for (const { mesh, indices } of skins) {
          mesh.skeleton.update();
          for (const { index, role } of indices) {
            mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
            const item = bounds[role] ??= { min: [Infinity,Infinity,Infinity], max: [-Infinity,-Infinity,-Infinity], inside: 0, dividerInside: 0, vertices: 0 };
            vertex.toArray().forEach((v,k) => { item.min[k] = Math.min(item.min[k],v); item.max[k] = Math.max(item.max[k],v); }); item.vertices++;
            if (vertex.x > box.minX && vertex.x < box.maxX && vertex.y > box.minY && vertex.y < box.maxY && vertex.z > box.minZ && vertex.z < box.maxZ && onTable(vertex.x,vertex.z)) item.inside++;
            if (vertex.y > 0 && vertex.y < 4.88 && [-7.565, -6.65, -5.735].some(z =>
              (vertex.x > -7.65 && vertex.x < -6.35 && Math.abs(vertex.z-z) < .035) ||
              (vertex.x > -6.3625 && vertex.x < -6.3075 && Math.abs(vertex.z-z) < .0275))) item.dividerInside++;
          }
        }
        samples.push({ key, pose: cat.pose, position: { ...cat.position }, elevation: cat.elevation, bounds });
        if (!move) break;
      }
      return { room, table: box, samples };
    }, { id, room });
    allMetrics.push(metrics);
  }
  await mkdir('artifacts/cat-room-descent', { recursive: true });
  await writeFile('artifacts/cat-room-descent/table-clearance.json', JSON.stringify(allMetrics, null, 2));
  for (const metrics of allMetrics) {
    expect(metrics.samples.at(-1)?.key).toBe('done');
    for (const sample of metrics.samples) {
      expect(Object.keys(sample.bounds).length).toBeGreaterThan(0);
      expect(Object.values(sample.bounds).reduce((sum, item) => sum + item.inside, 0), `table room${metrics.room} ${sample.key}`).toBe(0);
      expect(Object.values(sample.bounds).reduce((sum, item) => sum + item.dividerInside, 0), `divider room${metrics.room} ${sample.key}`).toBe(0);
    }
  }
});
