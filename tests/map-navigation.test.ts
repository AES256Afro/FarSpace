import { describe, it, expect, vi, afterEach } from "vitest";
import { MapCamera, MAP_RECT, PANEL_RECT, placeMapLabels, overlaps } from "../src/core/mapview";
import { generateWorld } from "../src/world";
import { GalaxyScene } from "../src/scenes/galaxy";
import { SystemMap, systemContacts, resolveLocalTarget } from "../src/scenes/systemmap";
import { FlightScene } from "../src/scenes/flight/index";
import { Game } from "../src/game";
import * as wire from "../src/core/wire";

afterEach(()=>vi.restoreAllMocks());
function fixture(realGalaxy=false) {
  vi.spyOn(wire,"fetchRooms").mockResolvedValue({rooms:[],pilots:0});vi.spyOn(wire,"fetchBases").mockResolvedValue([]);vi.spyOn(wire,"fetchLights").mockResolvedValue([]);vi.spyOn(wire,"fetchSquadronData").mockResolvedValue({squadrons:[],patrons:{}});vi.spyOn(wire,"getCallsign").mockReturnValue(null);
  const keys=new Set<string>(),held=new Set<string>(),world=generateWorld(418,{realGalaxy,maxLy:20});world.player.dockedAt=null;
  const galaxy=new GalaxyScene(),flight=new FlightScene();
  const g=Object.assign(Object.create(Game.prototype),{world,scenes:{flight,galaxy},input:{wasPressed:(k:string)=>keys.has(k),isDown:(k:string)=>held.has(k),mouseX:0,mouseY:0,mousePressed:false,mouseRight:false,mouseRightPressed:false,wheel:0,lastRawKey:null},spriteCache:new Map(),toast:vi.fn(),showHint:vi.fn(),autosave:vi.fn()}) as Game;
  g.setScene("flight");return {g,keys,held,galaxy,flight};
}

describe("map layout and navigation",()=>{
  it("fits all 51 nearby stars within the map rather than under the details panel",()=>{
    const {g,galaxy}=fixture(true);galaxy.fit(g);
    for(const s of Object.values(g.world.systems)){const at=galaxy.camera.project({x:s.gx,y:s.gy});expect(at.x).toBeGreaterThan(MAP_RECT.x);expect(at.x).toBeLessThan(MAP_RECT.x+MAP_RECT.w);expect(at.y).toBeGreaterThan(MAP_RECT.y);expect(at.y).toBeLessThan(MAP_RECT.y+MAP_RECT.h);}
  });
  it("keeps zoom anchored beneath the pointer and bounds extreme zoom",()=>{
    const c=new MapCamera();c.fit([{x:-50,y:-30},{x:100,y:300}]);const point={x:123,y:85},before=c.unproject(point);
    c.zoom(2,point);expect(c.unproject(point).x).toBeCloseTo(before.x);expect(c.unproject(point).y).toBeCloseTo(before.y);
    c.zoom(1e9,point);expect(c.scale).toBe(c.baseScale*12);c.zoom(1e-9,point);expect(c.scale).toBe(c.baseScale*0.6);
  });
  it("places dense labels without overlaps or crossing the map border",()=>{
    const labels=Array.from({length:80},(_,i)=>({id:String(i),text:`SYSTEM ${i}`,x:30+(i%10)*25,y:55+Math.floor(i/10)*19,color:"#fff",priority:i===25?100:0}));
    const placed=placeMapLabels(labels);expect(placed.length).toBeGreaterThan(10);expect(placed[0].id).toBe("25");
    for(const [i,a]of placed.entries()){expect(a.box.x).toBeGreaterThanOrEqual(MAP_RECT.x);expect(a.box.x+a.box.w).toBeLessThanOrEqual(MAP_RECT.x+MAP_RECT.w);for(const b of placed.slice(i+1))expect(overlaps(a.box,b.box)).toBe(false);}
  });
  it("does not plot on marker selection or allow the panel to select stars beneath it",()=>{
    const {g,galaxy}=fixture();galaxy.enter(g);const other=Object.values(g.world.systems).find(s=>s.id!==g.world.player.systemId)!;const at=galaxy.camera.project({x:other.gx,y:other.gy});
    Object.assign(g.input,{mousePressed:true,mouseX:at.x,mouseY:at.y});galaxy.update(g,0);expect(galaxy.selected).toBe(other.id);expect(g.world.player.navTarget).toBeFalsy();
    Object.assign(g.input,{mouseX:PANEL_RECT.x+5,mouseY:PANEL_RECT.y+5});galaxy.update(g,0);expect(galaxy.selected).toBe(other.id);expect(g.world.player.navTarget).toBeFalsy();
  });
  it("scrolls details without changing selection, camera, or a plotted course",()=>{
    const {g,galaxy}=fixture(true);galaxy.enter(g);g.world.player.bookmarks=Object.keys(g.world.systems);const sys=g.world.systems[g.world.player.systemId];sys.links=Object.keys(g.world.systems).filter(id=>id!==sys.id);
    Object.assign(g.input,{mouseX:PANEL_RECT.x+10,mouseY:PANEL_RECT.y+10,wheel:1});const camera=JSON.stringify(galaxy.camera);galaxy.update(g,0);const scroll=galaxy.infoScroll;expect(scroll).toBeGreaterThan(0);
    g.input.wheel=0;g.input.mouseX++;galaxy.update(g,0);expect(galaxy.infoScroll).toBe(scroll);expect(JSON.stringify(galaxy.camera)).toBe(camera);expect(galaxy.selected).toBe(sys.id);
  });
  it("keeps a current course when a selected system is unreachable",()=>{
    const {g,galaxy}=fixture();const ids=Object.keys(g.world.systems);g.world.player.navTarget=ids[1];const chosen=ids.at(-1)!;for(const s of Object.values(g.world.systems))s.links=s.links.filter(id=>id!==chosen);g.world.systems[chosen].links=[];galaxy.selected=chosen;galaxy.plot(g);expect(g.world.player.navTarget).toBe(ids[1]);
  });
  it("uses actual station positions and stops within interaction range for wrecks",()=>{
    const {g,flight}=fixture(),sys=g.world.systems[g.world.player.systemId],p=g.world.player;
    const w={id:"map-wreck",name:"Quiet",x:p.x+20,y:p.y,hazard:0,looted:false,loot:[]};sys.wrecks.push(w);
    flight.localTarget={systemId:sys.id,id:`wreck:${w.id}`};const target=flight.apTarget(g)!;expect(target.range).toBeLessThan(60);expect(target.label).toBe("QUIET");
    const station=sys.stations[0];flight.localTarget={systemId:sys.id,id:`station:${station.id}`};station.angle+=0.3;expect(flight.apTarget(g)?.x).toBeCloseTo(Math.cos(station.angle)*station.orbit);
    flight.localTarget={systemId:"elsewhere",id:`station:${station.id}`};expect(resolveLocalTarget(g,flight.localTarget)).toBeNull();
  });
  it("stops autopilot when its destination disappears instead of choosing another",()=>{
    const {g,flight}=fixture();flight.localTarget={systemId:g.world.player.systemId,id:"wreck:gone"};flight.autopilot=true;
    expect(flight.apTarget(g)).toBeNull();expect(flight.autopilot).toBe(false);expect(flight.localTarget).toBeNull();
  });
  it("turns a discovered derelict signal into one boardable wreck",()=>{
    const {g,flight}=fixture(),sys=g.world.systems[g.world.player.systemId],p=g.world.player;
    p.x=50000;p.y=50000;p.vx=0;p.vy=0;const set=vi.spyOn(g,"setScene").mockImplementation(()=>{});
    const signal={id:"boarding-signal",name:"Silent Hauler",kind:"derelict" as const,x:p.x,y:p.y,discovered:true,claimed:false,reward:100};sys.anomalies.push(signal);
    flight.tryInteract(g);expect(signal.claimed).toBe(true);expect(set).toHaveBeenCalledWith("wreck");expect(g.wreckTarget?.name).toBe(signal.name);
    const count=sys.wrecks.length;flight.tryInteract(g);expect(sys.wrecks).toHaveLength(count);expect(flight.loot).toHaveLength(0);
  });
  it("respects undiscovered signals and wreck scanner range",()=>{
    const {g}=fixture(),sys=g.world.systems[g.world.player.systemId],p=g.world.player;p.hullId="scout";
    sys.anomalies=[{id:"secret",name:"Secret",kind:"derelict",x:p.x,y:p.y,discovered:false,claimed:false,reward:100}];
    expect(systemContacts(g).some(c=>c.id==="signal:secret")).toBe(false);sys.anomalies[0].discovered=true;expect(systemContacts(g).some(c=>c.id==="signal:secret")).toBe(true);
  });
  it("freezes world and encounter clocks in the system map and closes cleanly with Escape",()=>{
    const {g,keys,flight}=fixture();flight.launching=0;keys.add("Tab");const before=JSON.stringify(g.world);flight.update(g,0.05);keys.clear();expect(flight.mapOpen).toBe(true);const npcs=[...flight.npcs];
    for(let i=0;i<1200;i++)flight.update(g,0.05);expect(JSON.stringify(g.world)).toBe(before);expect(flight.npcs).toEqual(npcs);
    keys.add("Escape");flight.update(g,0.05);expect(flight.mapOpen).toBe(false);expect(flight.paused).toBe(false);expect(g.world.time).toBe(0);
  });
});
