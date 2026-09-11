import { describe, expect, it, vi, afterEach } from "vitest";
import { generateShipDeck } from "../src/core/shipdeck";
import { prepareWreck, wreckRecovered } from "../src/core/derelicts";
import { generateWorld, type WreckDef } from "../src/world";
import { RepairScene } from "../src/scenes/repair";
import { WreckScene } from "../src/scenes/wreck";
import { EncounterScene } from "../src/scenes/encounter";
import { Game } from "../src/game";
import { decodeSave } from "../src/save";
import type { Npc } from "../src/scenes/flight/types";

afterEach(() => vi.restoreAllMocks());
const wreck = (): WreckDef => ({ id:"boarding-test",name:"Quiet Runner",x:0,y:0,hazard:0.8,looted:false,loot:[{id:"parts",qty:2},{id:"metals",qty:2}] });
function fixture() {
  const world=generateWorld(418);world.player.crew=[];world.player.cargo={};
  const keys=new Set<string>(), held=new Set<string>();
  const g=Object.assign(Object.create(Game.prototype),{world,scenes:{flight:{resumeNext:false,enter:vi.fn(),finishRepair:vi.fn(),spawnRaidersNearPlayer:vi.fn()},encounter:new EncounterScene()},input:{wasPressed:(k:string)=>keys.has(k),isDown:(k:string)=>held.has(k),mouseX:0,mouseY:0},toast:vi.fn(),showHint:vi.fn()}) as Game;
  return {g,keys,held};
}

describe("generated ship interiors",()=>{
  it("keeps every room and repair panel reachable across 300 seeds",()=>{
    const shapes=new Set<string>();
    for(let seed=0;seed<300;seed++){
      const d=generateShipDeck(seed), grid=d.tiles;shapes.add(grid.join("\n"));
      expect(grid.every(r=>r.length===grid[0].length)).toBe(true);
      expect(grid.length*10).toBeLessThanOrEqual(180);expect(grid[0].length*10).toBeLessThanOrEqual(400);
      const blocked=new Set(d.systems.map(s=>`${s.tx},${s.ty}`));
      const seen=new Set<string>(), todo=[[d.spawn.tx,d.spawn.ty]];
      while(todo.length){const [x,y]=todo.pop()!,key=`${x},${y}`;if(seen.has(key)||!grid[y]?.[x]||grid[y][x]==="#"||blocked.has(key))continue;seen.add(key);todo.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);}
      expect(seen.has(`${d.airlock.tx},${d.airlock.ty}`)).toBe(true);
      for(const room of d.rooms)expect(seen.has(`${room.x},${room.y}`)).toBe(true);
      for(const s of d.systems)expect([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen.has(`${s.tx+dx},${s.ty+dy}`))).toBe(true);
      expect(generateShipDeck(seed)).toEqual(d);
    }
    expect(shapes.size).toBeGreaterThan(290);
  });
  it("keeps panel work on the same ship after it drifts and after leaving the scene",()=>{
    const {g}=fixture(),scene=new RepairScene();
    const ship={x:50,y:90,disabled:true,name:"Tern",hull:10,hullMax:100} as Npc;g.repairTarget=ship;
    scene.enter(g);const layout=scene.deck;scene.health.E=78;scene.health.L=100;
    scene.leave(g,false);ship.x+=500;g.repairTarget=ship;scene.enter(g);
    expect(scene.deck).toEqual(layout);expect(scene.health.E).toBe(78);expect(scene.health.L).toBe(100);
  });
  it("keeps tender progress in a saved mission",()=>{
    const {g}=fixture(),scene=new RepairScene();
    const mission={id:"repair-tender",kind:"repair",accepted:true,done:false} as any;
    g.world.player.missions.push(mission);g.tenderMission=mission;scene.enter(g);scene.health.R=82;
    const loaded=decodeSave(JSON.stringify(g.world));expect(loaded.error).toBeNull();
    g.world=loaded.world!;g.tenderMission=g.world.player.missions.find(m=>m.id===mission.id)!;scene.enter(g);
    expect(scene.health.R).toBe(82);
  });
});

describe("derelict work and persistence",()=>{
  it("keeps wreck work accessible even with a full hold and unopened crates",()=>{
    for(let seed=0;seed<150;seed++){
      const w=wreck(),{layout,state}=prepareWreck(w,seed);
      const blocked=new Set(state.crates.map(c=>`${c.tx},${c.ty}`)),seen=new Set<string>(),todo=[[layout.spawn.tx,layout.spawn.ty]];
      while(todo.length){const [x,y]=todo.pop()!,key=`${x},${y}`;if(seen.has(key)||!layout.tiles[y]?.[x]||layout.tiles[y][x]==="#"||blocked.has(key))continue;seen.add(key);todo.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);}
      for(const point of [...Object.values(layout.fixtures),...state.crates])expect([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>seen.has(`${point.tx+dx},${point.ty+dy}`))).toBe(true);
    }
  });
  it("keeps collected cargo, recorder, fuel and repairs after save and reload",()=>{
    const w=wreck(),first=prepareWreck(w,418);first.state.crates[0].taken=true;first.state.recorder!.taken=true;
    first.state.power=63;first.state.fuel=2;first.state.breaches=[];first.state.rescued=true;
    const restored=prepareWreck(JSON.parse(JSON.stringify(w)),418);
    expect(restored.layout).toEqual(first.layout);expect(restored.state).toEqual(first.state);
    expect(wreckRecovered(restored.state)).toBe(false);
  });
  it("does not add new salvage to old cleared wrecks",()=>{
    const w=wreck();w.looted=true;const {state}=prepareWreck(w,418);
    expect(wreckRecovered(state)).toBe(true);expect(state.survivor).toBe(false);expect(state.fuel).toBe(0);
  });
  it("uses the actual cargo capacity without losing an untaken crate",()=>{
    const {g,keys}=fixture(),s=new WreckScene();g.wreckTarget=wreck();s.askedFor=g.wreckTarget.id;s.enter(g);
    const c=s.crates[0];s.px=c.tx*10+5;s.py=c.ty*10+5;keys.add("e");
    g.world.player.cargoMax=0;s.update(g,0);expect(c.taken).toBe(false);
    g.world.player.cargoMax=50;s.update(g,0);expect(c.taken).toBe(true);expect(g.world.player.cargo.parts).toBe(2);
    s.leave(g);s.enter(g);s.update(g,0);expect(g.world.player.cargo.parts).toBe(2);
  });
  it("requires power for rescue and gives one rescue across repeat boarding",()=>{
    const {g}=fixture(),s=new WreckScene();g.wreckTarget=wreck();s.askedFor=g.wreckTarget.id;s.enter(g);
    s.state.survivor=true;const lives=g.world.player.lives??0;
    s.useFixture(g,"survivor",0);expect(s.state.rescued).toBe(false);
    s.state.power=100;s.useFixture(g,"survivor",0);s.leave(g);s.enter(g);s.useFixture(g,"survivor",0);
    expect(g.world.player.lives).toBe(lives+1);
  });
  it("transfers only available fuel and consumes exactly one part per breach",()=>{
    const {g}=fixture(),s=new WreckScene();g.wreckTarget=wreck();s.askedFor=g.wreckTarget.id;s.enter(g);
    const before=s.state.fuel;g.world.player.fuel=g.world.player.fuelMax-3;s.useFixture(g,"fuel",0);
    expect(s.state.fuel).toBe(before-3);s.useFixture(g,"fuel",0);expect(s.state.fuel).toBe(before-3);
    const b={tx:4,ty:4};s.breaches=s.state.breaches=[b];s.px=45;s.py=45;
    s.useFixture(g,"breach",0);expect(s.breaches).toHaveLength(1);
    g.world.player.cargo.parts=2;s.useFixture(g,"breach",0);s.useFixture(g,"breach",0);
    expect(s.breaches).toHaveLength(0);expect(g.world.player.cargo.parts).toBe(1);
  });
  it("retains the boarding party and layout after its encounter card",()=>{
    const {g}=fixture(),s=new WreckScene();g.scenes.wreck=s;g.wreckTarget=wreck();
    g.world.player.crew=[{name:"Ari",role:"medic",sick:false,skill:2,morale:50} as any];
    g.setScene("wreck");const card=g.scenes.encounter as EncounterScene;
    expect(g.sceneName).toBe("encounter");const before=s.deck;
    const option=card.enc.options.find(o=>o.label==="THE MEDIC") ?? card.enc.options[0];option.result(g,{} as any);card.back(g);
    expect(s.deck).toBe(before);
    if(option.label==="THE MEDIC")expect(s.o2).toBe(130);
  });
});
