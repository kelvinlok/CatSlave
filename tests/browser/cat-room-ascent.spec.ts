import { expect, test } from '@playwright/test';
import type { Mesh, SkinnedMesh } from 'three';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ deviceScaleFactor: 1, viewport: { width: 480, height: 720 } });
test.setTimeout(300_000);

test('native cat uses the same protected route into and out of upper and lower bedrooms', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('catslave-language', 'en');
    localStorage.setItem('catslave-free-play', JSON.stringify(['Choco', 'Latte', '的的', '小塞', 'Yelo']));
    localStorage.setItem('catslave-wardrobe', JSON.stringify({ version: 1, outfits: { choco: { headwear: 'none', neckwear: 'none', footwear: 'none' } } }));
  });
  await page.route('**/models/**', route => /(?:lounge|christmas-tree|christmas-wall-decor|choco)\.glb/.test(route.request().url()) ? route.continue() : route.abort());
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__?.world.roomRoot.userData.loaded);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  for (const room of (process.env.CAT_ASCENT_ROOMS?.split(',').map(Number)??[7, 3, 0, 1, 2, 4, 5, 6])) {
    const id = await page.evaluate(room => {
      const t = window.__CATSLAVE_TEST__; t.game.phase = 'title';
      const names=['的的','小塞','Yelo'];
      const rooms=Array.from({length:8},(_,i)=>i===room?null:(names.shift()??null));
      t.game.restoreCatRooms({ version: 1, active: ['Choco', 'Latte'], rooms });
      t.game.startFreePlay(); t.game.cats.forEach(cat => cat.decisionAt = Infinity); t.refresh();
      return t.game.cats.find(cat => cat.name === 'Choco')!.id;
    },room);
    await page.waitForFunction(id => window.__CATSLAVE_TEST__.world.scene.children.find(root => root.userData.catId === id)?.userData.modelSource === 'blender', id);
    const folder = `artifacts/cat-room-ascent/room-${room+1}`; await mkdir(folder, { recursive: true });
    const trips = [];
    for (const direction of ['sleep', 'wake'] as const) {
      const data = await page.evaluate(({ id, room, direction, capture }) => {
        const t = window.__CATSLAVE_TEST__;
        if (!(direction === 'sleep' ? t.game.sendCatToRoom(id, room) : t.game.wakeRoomCat(room))) throw new Error(t.game.roomActionError);
        const root = t.world.scene.children.find(root => root.userData.catId === id)!, table = t.world.roomRoot.getObjectByName('furniture:table-1')!;
        table.updateWorldMatrix(true, true);
        const vertex = t.world.camera.position.clone(), points: number[][] = [], faces: number[][][] = [];
        table.traverse(object => { const mesh = object as Mesh; if (!mesh.isMesh) return;
          const vertices: number[][] = [];
          for (let i=0;i<mesh.geometry.attributes.position.count;i++) { mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld); vertices.push(vertex.toArray()); }
          points.push(...vertices); const index=mesh.geometry.index;
          for(let i=0;i<(index?.count??vertices.length);i+=3) faces.push([0,1,2].map(j=>vertices[index?index.getX(i+j):i+j]));
        });
        const top=Math.max(...points.map(p=>p[1])), surface=points.filter(p=>p[1]>=top-.13), topFaces=faces.filter(f=>f.every(p=>p[1]>=top-.13));
        const box={minX:Math.min(...surface.map(p=>p[0])),maxX:Math.max(...surface.map(p=>p[0])),minY:top-.13,maxY:top,minZ:Math.min(...surface.map(p=>p[2])),maxZ:Math.max(...surface.map(p=>p[2]))};
        const inTop=(x:number,z:number)=>topFaces.some(([a,b,c])=>{
          const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-10)return false;
          const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
          return u>=0&&v>=0&&u+v<=1;
        });
        const skins:{mesh:SkinnedMesh;indices:number[];paws:number[]}[]=[];
        root.traverse(object=>{const mesh=object as SkinnedMesh;if(!mesh.isSkinnedMesh||!mesh.visible)return;
          const indices:number[]=[],paws:number[]=[],si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;
          for(let i=0;i<mesh.geometry.attributes.position.count;i++)if((['X','Y','Z','W'] as const).some(c=>sw[`get${c}`](i)>.5&&/DEF_(head|body)/.test(mesh.skeleton.bones[si[`get${c}`](i)]?.name??'')))indices.push(i);
          for(let i=0;i<mesh.geometry.attributes.position.count;i++)if((['X','Y','Z','W'] as const).some(c=>sw[`get${c}`](i)>.5&&/DEF_paw/.test(mesh.skeleton.bones[si[`get${c}`](i)]?.name??'')))paws.push(i);
          skins.push({mesh,indices,paws});
        });
        let route: {x:number;z:number;height:number}[]|undefined, start: {x:number;z:number;height:number}|undefined;
        let previous='',completed=false, backward=0;
        const samples=[];const captured=new Set<string>();const frames:{label:string;data:string}[]=[];
        for(let step=0;step<6000;step++) {
          const before=t.game.cats.find(cat=>cat.id===id)!;
          const old={...before.position};const previousLeg=t.game.roomTransitions.find(m=>m.catId===id)?.index;
          t.game.tick(.025); if(step%4===0)t.refresh();
          const cat=[...t.game.cats,...t.game.sleepingCats].find(cat=>cat.id===id)!;
          const move=t.game.roomTransitions.find(m=>m.catId===id);
          if(move?.route.length&&!route) {route=structuredClone(move.route);start={...move.from};}
          if(move&&move.index===previousLeg&&cat.activity==='jumping'&&cat.pose>.14&&cat.pose<.82) backward=Math.min(backward,(cat.position.x-old.x)*Math.sin(cat.yaw)+(cat.position.z-old.z)*Math.cos(cat.yaw));
          const key=move?`${move.index}:${Math.floor(move.progress*20)}`:'done';
          if(key===previous)continue;previous=key;t.refresh();root.updateWorldMatrix(true,true);
          const target=move?.route[move.index],rising=!!target&&target.height>move!.from.height,falling=!!target&&target.height<move!.from.height;
          let tableInside=0,dividerInside=0,pawShelfInside=0,bodyShelfInside=0,wallInside=0;
          const inShelf=()=>[0,1,2,3].some(row=>{const y=.18+row*1.2;return vertex.x>-6.36&&vertex.x<-5.81&&vertex.z>-7.59&&vertex.z<(row>=2?-5.21:-5.71)&&vertex.y>y-.065&&vertex.y<y-.015;});
          if((rising||falling)&&cat.pose>.1)for(const{mesh,indices}of skins) {
            mesh.skeleton.update();for(const index of indices){
              mesh.getVertexPosition(index,vertex).applyMatrix4(mesh.matrixWorld);
              if(vertex.z<-7.98)wallInside++;
              if(rising&&cat.pose>.14&&cat.pose<.78&&inShelf())bodyShelfInside++;
              if(vertex.x>box.minX&&vertex.x<box.maxX&&vertex.y>box.minY&&vertex.y<box.maxY&&vertex.z>box.minZ&&vertex.z<box.maxZ&&inTop(vertex.x,vertex.z))tableInside++;
              if(vertex.y>0&&vertex.y<4.88&&[-7.565,-6.65,-5.735].some(z=>(vertex.x>-7.65&&vertex.x<-6.35&&Math.abs(vertex.z-z)<.035)||(vertex.x>-6.3625&&vertex.x<-6.3075&&Math.abs(vertex.z-z)<.0275)))dividerInside++;
            }
          }
          if(rising&&cat.pose>.14&&cat.pose<.78)for(const{mesh,paws}of skins){
            mesh.skeleton.update();for(const index of paws){
              mesh.getVertexPosition(index,vertex).applyMatrix4(mesh.matrixWorld);
              if(inShelf())pawShelfInside++;
            }
          }
          samples.push({key,x:cat.position.x,z:cat.position.z,y:cat.elevation,pose:cat.pose,activity:cat.activity,rise:(cat as typeof cat & {jumpRise?:number}).jumpRise??0,drop:cat.jumpDrop??0,rising,falling,tableInside,dividerInside,pawShelfInside,bodyShelfInside,wallInside});
          const frameKey=move?`${move.index}:${Math.floor(move.progress*10)}`:'done';
          if(capture&&!captured.has(frameKey)&&(((rising||falling)&&[2,5,8].includes(Math.floor(move!.progress*10)))||!move)) {
            captured.add(frameKey);
            t.world.camera.fov=48;t.world.camera.updateProjectionMatrix();
            t.world.camera.position.set(Math.min(-5.15,cat.position.x+2.5),Math.min(4.65,cat.elevation+1.8),cat.position.z+2.2);
            t.world.camera.lookAt(cat.position.x-.1,cat.elevation+.45,cat.position.z);
            frames.push({label:`${direction} ${key} y=${cat.elevation.toFixed(2)}`,data:t.captureFrame()});
          }
          if(!move){completed=true;break;}
        }
        const cat=[...t.game.cats,...t.game.sleepingCats].find(cat=>cat.id===id)!;
        return{route,start,samples,frames,completed,backward,final:{id:cat.id,y:cat.elevation,activity:cat.activity},table:box,layout:structuredClone(t.game.roomLayout.layout)};
      }, { id, room, direction, capture: (room===7||(room===3&&direction==='sleep')) && !process.env.CAT_ASCENT_SKIP_CAPTURES });
      trips.push(data);
      await writeFile(`${folder}/${direction}-motion.json`,JSON.stringify({...data,frames:data.frames.map(frame=>frame.label)},null,2));
      for(let i=0;i<data.frames.length;i++)await writeFile(`${folder}/${direction}-${i}.png`,Buffer.from(data.frames[i].data.split(',')[1],'base64'));
      expect(data.completed).toBe(true);expect(data.backward).toBeGreaterThanOrEqual(-.001);expect(data.final.id).toBe(id);
      expect(data.samples.some(s=>direction==='sleep'?s.rising:s.falling)).toBe(true);
      for(const sample of data.samples) {
        expect.soft(sample.wallInside,`${direction} room${room+1} ${sample.key} back wall`).toBe(0);
        expect.soft(sample.tableInside,`${direction} room${room+1} ${sample.key} table`).toBe(0);
        expect.soft(sample.bodyShelfInside,`${direction} room${room+1} ${sample.key} head/body shelf`).toBe(0);
        expect.soft(sample.pawShelfInside,`${direction} room${room+1} ${sample.key} paw shelf`).toBe(0);
        expect.soft(sample.dividerInside,`${direction} room${room+1} ${sample.key} divider`).toBe(0);
        if(sample.rising&&sample.pose>.14&&sample.pose<.82)expect(sample.rise).toBeGreaterThan(0);
        if(sample.falling&&sample.pose>.14&&sample.pose<.82)expect(sample.drop).toBeGreaterThan(0);
      }
      expect(data.final.activity).toBe(direction==='sleep'?'sleeping':'idle');
      expect(data.final.y).toBeCloseTo(direction==='sleep'?.18+Math.floor(room/2)*1.2:0);
      if(data.frames.length){
        const sheet=await page.evaluate(async frames=>{
          const w=240,h=380,cols=4,canvas=document.createElement('canvas');canvas.width=w*cols;canvas.height=h*Math.ceil(frames.length/cols);const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
          for(let i=0;i<frames.length;i++){const img=new Image();img.src=frames[i].data;await img.decode();const x=i%cols*w,y=Math.floor(i/cols)*h;ctx.drawImage(img,x,y+20,w,h-20);ctx.fillStyle='#172e27';ctx.font='12px sans-serif';ctx.fillText(frames[i].label,x+4,y+14);}return canvas.toDataURL('image/png');
        },data.frames);await writeFile(`${folder}/${direction}-contact-sheet.png`,Buffer.from(sheet.split(',')[1],'base64'));
      }
    }
    const upward=trips[0].route!,firstElevated=upward.findIndex(p=>p.height>0),protectedRoute=upward.slice(firstElevated-1);
    expect(protectedRoute).toEqual([trips[1].start!,...trips[1].route!].reverse());
    if(room>=4)expect(protectedRoute.some(p=>Math.abs(p.height-1.62)<.001)).toBe(true);
  }
  expect(errors).toEqual([]);
});
