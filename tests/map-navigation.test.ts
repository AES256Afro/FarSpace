import { describe, it, expect, vi, afterEach } from "vitest";
import { MapCamera, MAP_RECT, PANEL_RECT, placeMapLabels, overlaps } from "../src/core/mapview";
import { generateWorld, navRoute } from "../src/world";
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
  it("starts the selected local destination from the map and preserves the live flight",()=>{
    const {g,flight}=fixture(), sys=g.world.systems[g.world.player.systemId], map=flight.systemMap;
    flight.mapOpen=true; const contacts=[...flight.npcs]; map.selected=`station:${sys.stations[0].id}`;
    map.fly(g); expect(flight.autopilot).toBe(true); expect(flight.mapOpen).toBe(false);
    expect(flight.localTarget?.id).toBe(map.selected); expect(flight.npcs).toEqual(contacts);
    const t=flight.apTarget(g)!; Object.assign(g.world.player,{x:t.x,y:t.y,vx:0,vy:0});
    flight.updateAutopilot(g,0.05); expect(flight.autopilot).toBe(false); expect(g.world.player.vx).toBe(0); expect(g.world.player.vy).toBe(0);
  });
  it("leaves docking margin when stopping at a moving quest station",()=>{
    const {g,flight}=fixture(),p=g.world.player,sys=g.world.systems[p.systemId],st=sys.stations[0];
    flight.localTarget={systemId:sys.id,id:`station:${st.id}`};const target=flight.apTarget(g)!;
    expect(target.range).toBeLessThanOrEqual(40);Object.assign(p,{x:target.x+35,y:target.y,vx:0,vy:0});
    flight.autopilot=true;flight.updateAutopilot(g,.05);expect(flight.autopilot).toBe(false);
    st.angle+=st.speed*2;flight.tryInteract(g);expect(flight.docking).toBeTruthy();
  });
  it("flies a plotted galaxy route through its gate and stops in the chosen system",()=>{
    const {g,flight,galaxy}=fixture(), p=g.world.player, sys=g.world.systems[p.systemId];
    vi.spyOn(flight,"claimFirst").mockResolvedValue(); p.fuel=1000;
    g.setScene("galaxy"); galaxy.selected=sys.links[0]; const destination=galaxy.selected;
    galaxy.fly(g); expect(g.sceneName).toBe("flight"); expect(flight.autopilot).toBe(true); expect(flight.autoRoute).toBe(true);
    const t=flight.apTarget(g)!; Object.assign(p,{x:t.x,y:t.y,vx:0,vy:0}); const before=p.fuel;
    flight.updateAutopilot(g,0.05); expect(p.systemId).toBe(destination); expect(p.fuel).toBeLessThan(before);
    expect(flight.autopilot).toBe(false); expect(flight.autoRoute).toBe(false); expect(p.navTarget).toBeNull(); expect([p.vx,p.vy]).toEqual([0,0]);
  });
  it("does not start a route without jump fuel and allows manual takeover",()=>{
    const {g,flight,galaxy,held}=fixture(), p=g.world.player;
    galaxy.selected=g.world.systems[p.systemId].links[0]; p.fuel=0; galaxy.fly(g);
    expect(flight.autopilot).toBe(false); expect(p.navTarget).toBeFalsy();
    p.fuel=100; flight.startAutopilot(g); held.add("w"); flight.updateAutopilot(g,0.05); expect(flight.autopilot).toBe(false);
  });
  it("continues across intermediate systems and stops only at the selected final system",()=>{
    const {g,flight,galaxy}=fixture(), p=g.world.player;
    vi.spyOn(flight,"claimFirst").mockResolvedValue(); p.fuel=1000;
    const destination=Object.keys(g.world.systems).find(id=>(navRoute(g.world,p.systemId,id)?.length ?? 0)>2)!;
    expect(destination).toBeDefined(); g.setScene("galaxy"); galaxy.selected=destination; galaxy.fly(g);
    let jumps=0;
    while(flight.autopilot && jumps<20){const t=flight.apTarget(g)!;Object.assign(p,{x:t.x,y:t.y,vx:0,vy:0});flight.updateAutopilot(g,.05);jumps++;}
    expect(jumps).toBeGreaterThan(1);expect(p.systemId).toBe(destination);expect(flight.autopilot).toBe(false);expect(p.navTarget).toBeNull();
  });
  it("keeps a recovery tow out of automatic gate travel",()=>{
    const {g,flight}=fixture(), p=g.world.player, sys=g.world.systems[p.systemId];
    const wreck={id:"towed",name:"Towed",x:p.x,y:p.y,hazard:0,looted:false,loot:[],recovery:{hullId:"scout",hull:20,angle:0,status:"towing" as const}};
    sys.wrecks.push(wreck); p.recoveryTow={systemId:sys.id,wreckId:wreck.id}; p.navTarget=sys.links[0];
    expect(flight.startAutopilot(g,true)).toBe(false); expect(flight.autopilot).toBe(false);
  });
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
    flight.tryInteract(g);expect(signal.claimed).toBe(true);expect(set).toHaveBeenCalledWith("salvage");expect(g.wreckTarget?.name).toBe(signal.name);
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

describe("galaxy menu identity and complete details", () => {
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as CanvasRenderingContext2D;
  function menu(real = true) {
    const f = fixture(real); f.g.world.player.story = -1; f.g.world.player.tutorial = -1; f.g.setScene("galaxy");
    const key = (k: string) => { f.keys.add(k); f.galaxy.update(f.g, 0); f.keys.clear(); };
    const click = (x: number, y: number) => { Object.assign(f.g.input, { mousePressed: true, mouseX: x, mouseY: y }); f.galaxy.update(f.g, 0); f.g.input.mousePressed = false; };
    const draw = () => f.galaxy.draw(f.g, ctx);
    return { ...f, key, click, draw };
  }
  it("pages all 51 systems with Home/End and explicit search selection", () => {
    const f = menu(); f.key("f"); f.draw(); f.key("PageDown"); expect(f.galaxy.searchIndex).toBe(12); f.key("End"); f.draw();
    expect(f.galaxy.searchIndex).toBe(50); expect(f.galaxy.search.offset).toBe(39); const id = f.galaxy.search.selected, current = f.galaxy.selected;
    f.click(330, 200); expect(f.galaxy.searching).toBe(true); expect(f.galaxy.selected).toBe(current); f.click(340, 235);
    expect(f.galaxy.selected).toBe(id); expect(f.galaxy.searching).toBe(false); expect(f.g.world.player.navTarget).toBeFalsy(); expect(f.flight.autopilot).toBe(false);
    f.key("f"); f.key("End"); f.key("Home"); expect(f.galaxy.searchIndex).toBe(0); expect(f.galaxy.search.offset).toBe(0);
  });
  it("keeps a selected search result when earlier names are inserted and resolves drawn rows by id", () => {
    const f = menu(); f.key("f"); f.key("PageDown"); f.draw(); const id = f.galaxy.search.selected!, offset = f.galaxy.search.offset;
    const template = f.g.world.systems[id]; f.g.world.systems.extra = { ...template, id: "extra", name: "000 NEW", links: [] };
    f.click(330, 65); expect(f.galaxy.search.selected).toBe(id); expect(f.galaxy.search.offset).toBe(offset + 1); f.key("Enter"); expect(f.galaxy.selected).toBe(id);
  });
  it("requires a fresh selection if a result disappears during draw before Enter", () => {
    const f = menu(); f.key("f"); f.key("End"); const id = f.galaxy.search.selected!; f.draw(); delete f.g.world.systems[id]; f.draw();
    const before = f.galaxy.selected; f.key("Enter"); expect(f.galaxy.searching).toBe(true); expect(f.galaxy.selected).toBe(before);
    const next = f.galaxy.search.selected; f.key("Enter"); expect(f.galaxy.searching).toBe(false); expect(f.galaxy.selected).toBe(next); expect(f.g.world.player.navTarget).toBeFalsy();
  });
  it("handles no matches and bounds header, margin and footer clicks", () => {
    const f = menu(), before = f.galaxy.selected; f.key("f"); f.galaxy.query = "NO SUCH PLACE"; f.draw(); f.key("End"); f.key("Enter");
    for (const [x, y] of [[317, 70], [466, 70], [340, 64], [340, 209], [311, 235], [416, 235]]) f.click(x, y);
    expect(f.galaxy.searching).toBe(true); expect(f.galaxy.searchIndex).toBe(0); expect(f.galaxy.search.offset).toBe(0); expect(f.galaxy.selected).toBe(before);
    f.key("Escape"); expect(f.galaxy.searching).toBe(false); expect(f.g.sceneName).toBe("galaxy"); expect(f.galaxy.results(f.g)).toHaveLength(51);
  });
  it("does not leave a closed text query filtering star selection", () => {
    const f = menu(); f.key("f"); f.g.input.textEvents = [..."Sirius"]; f.galaxy.update(f.g, 0); f.g.input.textEvents = []; f.draw(); f.key("Enter"); expect(f.g.world.systems[f.galaxy.selected!].name).toBe("Sirius");
    const other = Object.values(f.g.world.systems).find(s => s.name === "Sol")!; f.galaxy.select(f.g, other.id, true); f.draw(); const target = f.galaxy.camera.project({ x: other.gx, y: other.gy });
    f.galaxy.selected = Object.keys(f.g.world.systems).find(id => id !== other.id)!; f.click(target.x, target.y); expect(f.galaxy.selected).toBe(other.id);
  });
  it("keeps quest filtering separate from course changes and preserves an eligible selection", () => {
    const f = menu(false), p = f.g.world.player, ids = Object.keys(f.g.world.systems).filter(id => id !== p.systemId).slice(0, 2);
    p.missions = ids.map((id, i) => ({ id: `quest-${i}`, title: `Quest ${i}`, desc: "Full quest terms", kind: "delivery", commodityId: "food", qty: 2, fromStationId: f.g.world.systems[p.systemId].stations[0].id, targetSystemId: id, targetStationId: f.g.world.systems[id].stations[0].id, reward: 20, accepted: true, done: false }));
    f.galaxy.selected = ids[1]; p.navTarget = ids[0]; f.key("q"); expect(f.galaxy.selected).toBe(ids[1]); expect(p.navTarget).toBe(ids[0]);
    p.missions[1].done = true; f.draw(); expect(f.galaxy.selected).toBe(ids[1]); expect(f.galaxy.infoLines(f.g, null).some(l => l.text === "QUEST OBJECTIVES: 0")).toBe(true); expect(p.navTarget).toBe(ids[0]);
    f.key("q"); expect(f.galaxy.selected).toBe(ids[1]); expect(p.navTarget).toBe(ids[0]);
  });
  it("reads complete unspaced names and all quest actions without moving the camera or course", () => {
    const f = menu(false), p = f.g.world.player, sys = f.g.world.systems[p.systemId], name = "Z".repeat(210); sys.name = name;
    p.missions = Array.from({ length: 15 }, (_, i) => ({ id: `quest-${i}`, title: `Quest ${i}`, desc: `COMPLETE DESCRIPTION ${i}`, kind: "delivery", commodityId: "food", qty: i + 1, fromStationId: sys.stations[0].id, targetStationId: sys.stations[0].id, targetSystemId: sys.id, reward: 20, accepted: true, done: false }));
    const before = JSON.stringify(f.g.world), camera = JSON.stringify(f.galaxy.camera); const lines = f.galaxy.infoLines(f.g);
    expect(lines.every(l => l.text.length <= 36)).toBe(true); expect(lines.slice(0, 6).map(l => l.text).join("")).toBe(name);
    f.key("i"); expect(f.galaxy.info!.sections[0][0]).toBe(name); expect(JSON.stringify(f.galaxy.info!.sections)).toContain("QUEST 14"); f.key("End"); expect(f.galaxy.info!.scroll).toBe(f.galaxy.info!.maxScroll()); f.key("Escape");
    f.key("o"); expect(f.galaxy.info!.sections).toHaveLength(15); expect(f.galaxy.pausesVoyage).toBe(true); expect(JSON.stringify(f.g.world)).toBe(before); expect(JSON.stringify(f.galaxy.camera)).toBe(camera);
  });
  it("survives a missing selected system without plotting an adjacent destination", () => {
    const f = menu(false), ids = Object.keys(f.g.world.systems), id = ids[1]; f.galaxy.select(f.g, id); f.draw(); delete f.g.world.systems[id];
    expect(() => f.draw()).not.toThrow(); f.key("a"); expect(f.g.sceneName).toBe("galaxy"); expect(f.flight.autopilot).toBe(false); expect(f.g.world.player.navTarget).toBeFalsy();
    f.galaxy.selected = "missing"; expect(() => f.galaxy.infoLines(f.g)).not.toThrow(); f.galaxy.plot(f.g); expect(f.g.world.player.navTarget).toBeFalsy();
  });
  it("cleans a pending nested reader when its scene changes", () => {
    const f = menu(); f.key("i"); const close = vi.fn(); f.galaxy.info!.closeSearchBox = close; f.galaxy.onSceneLeave(); expect(close).toHaveBeenCalledOnce(); expect(f.galaxy.info).toBeUndefined(); expect(f.galaxy.pausesVoyage).toBe(false);
  });
  it("retains a local contact removal guard across a draw before Fly", () => {
    const f = menu(false), map = f.flight.systemMap, sys = f.g.world.systems[f.g.world.player.systemId];
    const wreck = { id: "removed", name: "Removed wreck", x: 200, y: 200, hazard: 0, looted: false, loot: [] }; sys.wrecks.push(wreck); map.enter(f.g); map.selected = "wreck:removed"; map.sync(f.g); map.draw(f.g, ctx);
    sys.wrecks.pop(); map.draw(f.g, ctx); f.keys.add("a"); map.update(f.g, 0); f.keys.clear(); expect(f.flight.autopilot).toBe(false); expect(f.flight.localTarget).toBeNull();
  });
});
