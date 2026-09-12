// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Game } from "../src/game";
import { generateWorld, applyHull } from "../src/world";
import { HULLS, SERVICE_CUTTER } from "../src/data/hulls";
import { DECKS } from "../src/data/decks";
import { InteriorScene } from "../src/scenes/interior";
import { updateVoyageSystems } from "../src/core/runtime";
import { nearestTile } from "../src/scenes/walkbase";
import { sfx } from "../src/core/sfx";

afterEach(()=>vi.restoreAllMocks());
function fixture(id="scout") {
  const w=generateWorld(425),p=w.player;applyHull(p,id);
  p.crew=[];p.tutorial=-1;p.story=0;p.story2=-1;p.story3=-1;p.missions=[];
  p.keepsakes=["first crossing"];p.furnishings=["hammock"];p.cargo={parts:3};
  const interior=new InteriorScene(),keys=new Set<string>();
  const g=Object.assign(Object.create(Game.prototype),{world:w,sceneName:"interior",scenes:{interior},frontend:false,input:{wasPressed:(k:string)=>keys.has(k),isDown:(k:string)=>keys.has(k),mousePressed:false,mouseX:0,mouseY:0,wheel:0},showHint:vi.fn(),toast:vi.fn()}) as Game;
  interior.enter(g);return{g,w,p,interior,keys};
}

describe("ship deck access",()=>{
  for(const h of [...HULLS,SERVICE_CUTTER])it(`${h.name} has a free spawn and routes to equipment and every crew post`,()=>{
    const original=JSON.stringify(DECKS),{g,interior:s}=fixture(h.id);
    expect(new Set(s.deck.map(r=>r.length)).size).toBe(1);
    for(const dx of [-3,3])for(const dy of [-3,3])expect(s.solid(Math.floor((s.px+dx)/10),Math.floor((s.py+dy)/10))).toBe(false);
    const targets=s.guideTargets(g);expect(targets.some(t=>t.id==="A")).toBe(true);expect(targets.some(t=>t.id==="C")).toBe(true);
    for(const t of targets){s.guide=t.id;const route=s.guidePath(g);expect(route.length>0||Math.hypot(s.px-t.tx*10-5,s.py-t.ty*10-5)<16,`reachable ${t.label}`).toBe(true);for(const cell of route)expect(s.solid(cell.tx,cell.ty)).toBe(false);const end=route.at(-1);if(end)expect(nearestTile(s.deck,end.tx*10+5,end.ty*10+5,"ACELRWGMBKSHp")?.ch,`interaction ${t.label}`).toBe(t.id);}
    expect(s.crewSpots().length).toBeGreaterThanOrEqual(h.crewSlots);
    for(const t of s.crewSpots())expect(s.findPath(Math.floor(s.px/10),Math.floor(s.py/10),t.tx,t.ty).length).toBeGreaterThan(0);
    expect(JSON.stringify(DECKS)).toBe(original);
  });
  it("discards positions from the old hull and retains owned items across a cutter loan and return",()=>{
    const {g,p,interior:s}=fixture("freighter");
    p.crew=[{name:"Ada",role:"engineer",skill:1,morale:80}];
    for(const id of [SERVICE_CUTTER.id,"scout","freighter"]){s.crewPos=[{x:385,y:105,tx:385,ty:105,pause:2}];applyHull(p,id);s.enter(g);s.wanderCrew(p,0,false);const at=s.crewAt(0)!;expect(s.solid(Math.floor(at.x/10),Math.floor(at.y/10))).toBe(false);expect(p.keepsakes).toEqual(["first crossing"]);expect(p.furnishings).toEqual(["hammock"]);}
  });
  it("routes around fire and keeps hazard repair targets available",()=>{
    const {g,p,interior:s}=fixture();s.guide="E";const first=s.guidePath(g)[2];p.fires=[first];p.breaches=[{tx:2,ty:2}];
    expect(s.guidePath(g).some(t=>t.tx===first.tx&&t.ty===first.ty)).toBe(false);
    expect(s.damageTargets(g).map(t=>t.id)).toEqual(expect.arrayContaining([`fire:${first.tx}:${first.ty}`,"breach:2:2"]));
    p.fires=[];p.breaches=[];expect(s.damageTargets(g)).toEqual([]);
  });
  it("repairs physical equipment with the existing cost and sound and retains the completed condition",()=>{
    const {g,p,interior:s,keys}=fixture(),repair=vi.spyOn(sfx,"repair").mockImplementation(()=>{});
    const engine=p.systems.find(sys=>sys.id==="engines")!;engine.health=40;s.guide="E";
    const at=s.guidePath(g).at(-1)!;s.px=at.tx*10+5;s.py=at.ty*10+5;keys.add("e");
    for(let i=0;i<3;i++)s.update(g,1.3);
    keys.clear();expect(engine.health).toBe(100);expect(p.cargo.parts).toBe(2);expect(repair).toHaveBeenCalledTimes(3);expect(s.damageTargets(g)).toEqual([]);
    s.enter(g);expect(s.guideTargets(g).find(t=>t.id==="E")?.health).toBe(100);expect(p.keepsakes).toEqual(["first crossing"]);
  });
  it("keeps a nearby crew member from interrupting a repair or selected helm interaction",()=>{
    const {g,p,interior:s,keys}=fixture(),engine=p.systems.find(sys=>sys.id==="engines")!;
    engine.health=40;s.guide="E";const at=s.guidePath(g).at(-1)!;s.px=at.tx*10+5;s.py=at.ty*10+5;
    p.crew=[{name:"Ada",role:"pilot",skill:3,morale:80}];s.crewPos=[{x:s.px,y:s.py,tx:s.px,ty:s.py,pause:999}];
    const specialty=vi.spyOn(s,"offerSpecialty").mockImplementation(()=>{});keys.add("e");s.update(g,.5);keys.clear();expect(specialty).not.toHaveBeenCalled();expect(s.repairing).not.toBeNull();
    s.enter(g);s.guide="C";s.crewPos=[{x:s.px,y:s.py,tx:s.px,ty:s.py,pause:999}];g.scenes.flight={resumeNext:false} as any;
    const change=vi.spyOn(g,"setScene").mockImplementation(()=>{});keys.add("e");s.update(g,0);expect(change).toHaveBeenCalledWith("flight");expect(specialty).not.toHaveBeenCalled();
  });
  it("pauses the voyage while reading long deck records and returns to the same position",()=>{
    const {g,w,p,interior:s,keys}=fixture();p.keepsakes=Array.from({length:50},(_,i)=>`Crossing ${i}`);
    const at=[s.px,s.py],before=JSON.stringify(w);keys.add("Tab");s.update(g,0);keys.clear();expect(s.pausesVoyage).toBe(true);
    keys.add("End");s.update(g,0);keys.clear();expect(s.info!.scroll).toBe(s.info!.maxScroll());expect(s.info!.scroll).toBeGreaterThan(0);
    keys.add("w");s.update(g,1);updateVoyageSystems(g,100);keys.clear();expect(JSON.stringify(w)).toBe(before);
    keys.add("Escape");s.update(g,0);expect(s.info).toBeUndefined();expect([s.px,s.py]).toEqual(at);
  });
});
