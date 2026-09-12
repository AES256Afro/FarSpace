import { activeSupport, supportAction } from "../core/supportjobs";
import { questLocations, type QuestLocation } from "../core/questlocations";
import { drawQuestMarker } from "../gfx/questmarkers";
import { hasMiningRemains } from "../core/mining";
import { wreckAvailable } from "../core/salvage";
import type { Game } from "../game";
import { drawText } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { hasModule } from "../data/modules";
import { hull } from "../data/hulls";
import { SYSTEM_SIZE, infraAt, infraLit, stormBlind, wondersIn } from "../world";
import { singersBerth } from "../core/singers";
import { MapCamera, MAP_RECT, PANEL_RECT, contains, drawMapLabels, mapFrame, mapButton, clippedText, type MapLabel, type PlacedLabel } from "../core/mapview";
import type { FlightScene } from "./flight/index";
import { ReaderOverlay } from "./reader";

export interface LocalMapTarget { systemId: string; id: string }
export interface SystemContact { id: string; name: string; kind: string; x: number; y: number; color: string; detail: string; range: number; quests?: QuestLocation[] }
export function systemContacts(g: Game, knownTarget?: string): SystemContact[] {
  const p = g.world.player, sys = g.world.systems[p.systemId];
  const out: SystemContact[] = [];
  const quests = questLocations(g.world).filter(q => q.systemId === sys.id);
  for (const s of sys.stations) out.push({ id: `station:${s.id}`, name: s.name, kind: "STATION", x: Math.cos(s.angle)*s.orbit, y: Math.sin(s.angle)*s.orbit, color: s.military ? PAL.danger : PAL.ui, detail: s.military ? "MILITARY DOCK" : "DOCK / TRADE / REPAIR", range: 40 });
  sys.planets.forEach((pl,i) => out.push({ id: `planet:${i}`, name: pl.name, kind: "PLANET", x: Math.cos(pl.angle)*pl.orbit, y: Math.sin(pl.angle)*pl.orbit, color: PAL.grey, detail: "APPROACH TO ENTER ORBIT", range: pl.radius+70 }));
  for (const j of sys.jumpPoints) out.push({ id:`gate:${j.id}`, name:g.world.systems[j.targetSystemId].name, kind:"GATE", x:j.x,y:j.y,color:PAL.info,detail:`JUMP TO ${g.world.systems[j.targetSystemId].name.toUpperCase()}`,range:45 });
  sys.asteroids.forEach((a, i) => {
    if ((a.ore > 0 || hasMiningRemains(a)) && (Math.hypot(a.x-p.x,a.y-p.y)<1500 || knownTarget === `rock:${i}`))
      out.push({id:`rock:${i}`,name:`${a.ore <= 0 ? "Mining remains" : a.core ? "Core asteroid" : a.rich ? "Rich asteroid" : "Asteroid"} ${i+1}`,kind:"ROCK",x:a.x,y:a.y,color:PAL.mining,detail:a.ore <= 0 ? "ORE AND MATERIALS / STORED HERE" : a.core ? "SEISMIC CHARGE REQUIRED" : "MINE / HOLD M WITHIN 90M",range:30});
  });
  const wreckRange = hasModule(p,"fss") || hull(p.hullId).scanner ? Infinity : 1500;
  for (const w of sys.wrecks) if (wreckAvailable(w) && (Math.hypot(w.x-p.x,w.y-p.y)<wreckRange || knownTarget === `wreck:${w.id}` || quests.some(q => q.contactId === `wreck:${w.id}`))) out.push({ id:`wreck:${w.id}`,name:w.name,kind:"WRECK",x:w.x,y:w.y,color:PAL.warn,detail:w.boarding?.survivor && !w.boarding.rescued ? "SURVIVOR ABOARD" : w.recovery && w.recovery.status !== "dismantled" ? "DISABLED / SALVAGE OR RECOVER HULL" : w.looted ? "INTERIOR CLEARED / EXTERIOR SALVAGE" : `BOARD / SALVAGE / HAZARD ${Math.round(w.hazard*100)}%`,range:35 });
  for (const a of sys.anomalies) if (a.discovered && !a.claimed) out.push({ id:`signal:${a.id}`,name:a.name,kind:"SIGNAL",x:a.x,y:a.y,color:PAL.info,detail:a.kind === "derelict" ? "DERELICT / BOARDABLE" : "APPROACH TO INVESTIGATE",range:35 });
  for (const i of infraAt(g.world,sys.id)) out.push({ id:`infra:${i.id}`,name:i.kind.toUpperCase(),kind:"STRUCTURE",x:i.x,y:i.y,color:infraLit(i) ? PAL.gold : PAL.danger,detail:infraLit(i) ? "OPERATIONAL" : "POWER OFFLINE",range:60 });
  for (const w of wondersIn(g.world,sys.id)) if (w.seen || p.flags?.[`rumour:${w.id}`]) out.push({ id:`wonder:${w.id}`,name:w.seen ? w.name : "RUMOURED SITE",kind:"SIGNAL",x:w.x,y:w.y,color:PAL.gold,detail:w.kind.toUpperCase(),range:100 });
  const berth = singersBerth(g.world);
  if (berth) out.push({ id:"singers",name:"SINGERS' BERTH",kind:"STATION",...berth,color:PAL.ui,detail:"APPROACH TO VISIT",range:60 });
  for(const j of p.support?.jobs??[]) if(activeSupport(j)&&j.phase!=="report"&&j.systemId===sys.id)out.push({id:`support:${j.id}`,name:j.name,kind:"SHIP",x:j.ship.x,y:j.ship.y,color:PAL.good,detail:supportAction(g.world,j),range:45});
  for (const c of out) c.quests = quests.filter(q => q.contactId === c.id).sort((a,b) => Number(!!b.focused) - Number(!!a.focused));
  return out;
}
export function resolveLocalTarget(g: Game, target: LocalMapTarget | null): SystemContact | null {
  if (!target || target.systemId !== g.world.player.systemId || stormBlind(g.world,target.systemId)) return null;
  return systemContacts(g, target.id).find(c=>c.id===target.id) ?? null;
}

const QUESTS = { x: 212, y: 36, w: 86, h: 15 };
const OBJECTIVES = { x: 212, y: 55, w: 86, h: 15 };
const DETAILS = { x: 316, y: 73, w: 152, h: 36 };
const FILTERS = ["ALL","STATION","WRECK","SIGNAL","GATE","PLANET","ROCK"];
export class SystemMap {
  camera = new MapCamera();
  selected: string | null = null;
  filter = "ALL";
  scroll = 0;
  labels: PlacedLabel[] = [];
  info?: ReaderOverlay;
  private listKeys: string[] = [];
  private drawnRows: string[] = [];
  private selectionChanged = false;
  closeInfo(): void { this.info?.onSceneLeave(); this.info = undefined; }
  sync(g: Game): SystemContact[] {
    const contacts = this.contacts(g), keys = contacts.map(c => c.id), top = this.listKeys[this.scroll];
    if (keys.length !== this.listKeys.length || keys.some((id, i) => id !== this.listKeys[i])) {
      const oldIndex = this.selected ? this.listKeys.indexOf(this.selected) : -1;
      if (oldIndex >= 0 && !keys.includes(this.selected!)) { this.selected = keys[Math.min(oldIndex, keys.length - 1)] ?? null; this.selectionChanged = true; }
      if (top && keys.includes(top)) this.scroll = keys.indexOf(top);
      this.listKeys = keys;
    }
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, keys.length - 7)));
    return contacts;
  }
  private setFilter(g: Game, filter: string): void {
    this.filter = filter; this.scroll = 0; this.selectionChanged = false; this.listKeys = []; this.drawnRows = [];
    const contacts = this.contacts(g);
    if (!contacts.some(c => c.id === this.selected)) this.selected = contacts[0]?.id ?? null;
    this.sync(g);
  }
  openInfo(g: Game, allObjectives = false): void {
    const sys = g.world.systems[g.world.player.systemId];
    const contact = systemContacts(g, this.selected ?? undefined).find(c => c.id === this.selected);
    const quests = allObjectives || !contact ? questLocations(g.world).filter(q => q.systemId === sys.id) : contact.quests ?? [];
    const sections: [string, string[]][] = allObjectives || !contact ? [[sys.name.toUpperCase(), [`${quests.length} CURRENT OBJECTIVES. UNKNOWN SIGNALS REQUIRE A SCAN.`]]]
      : [[contact.name.toUpperCase(), [contact.kind, contact.detail, `DISTANCE ${Math.round(Math.hypot(contact.x - g.world.player.x, contact.y - g.world.player.y))}M.`, "CLOSE DETAILS TO PLOT OR FLY TO THIS DESTINATION."]]];
    sections.push(...quests.map(q => [`${q.focused ? "CHOSEN: " : ""}${q.title.toUpperCase()}`, [`${q.source}${q.ready ? " / READY TO HAND IN" : ""}`, q.action]] as [string, string[]]));
    this.info = new ReaderOverlay(allObjectives ? "SYSTEM OBJECTIVES" : "DESTINATION DETAILS", sections, () => { this.info = undefined; });
  }
  contacts(g: Game): SystemContact[] { return systemContacts(g, this.selected ?? undefined).filter(c=>this.filter==="ALL" || (this.filter==="QUEST" ? !!c.quests?.length : c.kind===this.filter)).sort((a,b)=>Number(!!b.quests?.length)-Number(!!a.quests?.length)||a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name)); }
  fit(g: Game): void {
    const p=g.world.player;
    this.camera.fit([{x:-SYSTEM_SIZE,y:-SYSTEM_SIZE},{x:SYSTEM_SIZE,y:SYSTEM_SIZE},{x:p.x,y:p.y},...systemContacts(g)]);
  }
  enter(g: Game): void { this.closeInfo(); this.fit(g); this.selected = (g.scenes.flight as FlightScene).localTarget?.id ?? null; this.scroll=0; this.selectionChanged=false; this.filter="ALL"; this.listKeys=[]; this.drawnRows=[]; this.sync(g); }
  fly(g: Game): void {
    const target = systemContacts(g, this.selected ?? undefined).find(c => c.id === this.selected);
    if (!target) { g.toast("SELECT A DESTINATION FIRST."); return; }
    const fs = g.scenes.flight as FlightScene;
    fs.localTarget = { systemId: g.world.player.systemId, id: target.id };
    g.world.player.navTarget = null; delete g.world.player.navStationId; g.world.player.singersCourse = false;
    if (fs.startAutopilot(g)) { fs.mapOpen = false; g.input.flush?.(); g.input.down?.clear(); }
  }
  update(g: Game, dt: number): void {
    if (this.info) { this.info.update(g); return; }
    const inp=g.input, fs=g.scenes.flight as FlightScene;
    if (inp.wasPressed("Escape") || inp.wasPressed("Tab")) { fs.mapOpen=false; return; }
    if (inp.wasPressed("g")) { fs.mapOpen=false; g.setScene("galaxy"); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) { g.load(); return; }
    if (stormBlind(g.world,g.world.player.systemId)) return;
    const previous = this.selected, contacts = this.sync(g);
    const changedSelection = this.selectionChanged || (previous !== null && previous !== this.selected); this.selectionChanged = false;
    if (changedSelection && (inp.wasPressed("a") || inp.wasPressed("n") || inp.wasPressed("Enter") || (inp.mousePressed && contains({x:312,y:231,w:160,h:15},inp.mouseX,inp.mouseY)))) { g.toast("CONTACT CHANGED. CHECK THE NEW SELECTION."); return; }
    if (inp.wasPressed("i") || (inp.mousePressed && contains(DETAILS, inp.mouseX, inp.mouseY))) { this.openInfo(g); return; }
    if (inp.wasPressed("o") || (inp.mousePressed && contains(OBJECTIVES, inp.mouseX, inp.mouseY))) { this.openInfo(g, true); return; }
    if (inp.wasPressed("a") || (inp.mousePressed && contains({x:394,y:231,w:78,h:15},inp.mouseX,inp.mouseY))) { this.fly(g); return; }
    if (inp.wasPressed("q") || (inp.mousePressed && contains(QUESTS,inp.mouseX,inp.mouseY))) { this.setFilter(g, this.filter === "QUEST" ? "ALL" : "QUEST"); return; }
    this.camera.update(inp,dt);
    if (inp.wasPressed("Home") || (inp.mousePressed && contains({x:8,y:231,w:50,h:15},inp.mouseX,inp.mouseY))) this.fit(g);
    if (inp.mousePressed && inp.mouseY>=231 && inp.mouseY<246 && inp.mouseX>=62 && inp.mouseX<300) {
      this.setFilter(g, FILTERS[Math.floor((inp.mouseX-62)/34)]); return;
    }
    if (inp.wheel && contains({ x:318, y:127, w:148, h:84 },inp.mouseX,inp.mouseY)) this.scroll+=Math.sign(inp.wheel)*3;
    if (inp.wasPressed("PageDown")) this.scroll+=7;
    if (inp.wasPressed("PageUp")) this.scroll-=7;
    this.scroll=Math.max(0,Math.min(this.scroll,Math.max(0,contacts.length-7)));
    if (inp.wasPressed("[") || inp.wasPressed("]")) {
      const i=contacts.findIndex(c=>c.id===this.selected);
      const next=contacts[(i+(inp.wasPressed("]") ? 1 : contacts.length-1))%contacts.length];
      if (next) { this.selected=next.id; this.camera.x=next.x; this.camera.y=next.y; this.scroll=Math.max(0,contacts.indexOf(next)-6); }
    }
    if (inp.mousePressed && contains(MAP_RECT,inp.mouseX,inp.mouseY)) {
      const label=this.labels.find(l=>contains(l.box,inp.mouseX,inp.mouseY));
      let best=label?.id ?? null, distance=label ? 0 : 9;
      for (const c of contacts) { const at=this.camera.project(c), d=Math.hypot(at.x-inp.mouseX,at.y-inp.mouseY); if (d<distance) { distance=d;best=c.id; } }
      if (best && best!=="you" && contacts.some(c=>c.id===best)) this.selected=best;
    }
    if (inp.mousePressed && inp.mouseX>=318 && inp.mouseX<466 && inp.mouseY>=127 && inp.mouseY<211) {
      const id=this.drawnRows[Math.floor((inp.mouseY-127)/12)];
      const c=contacts.find(c=>c.id===id);
      if (c) { this.selected=c.id; this.camera.x=c.x; this.camera.y=c.y; }
    }
    if (inp.wasPressed("n") || inp.wasPressed("Enter") || (inp.mousePressed && contains({x:312,y:231,w:78,h:15},inp.mouseX,inp.mouseY))) {
      const target=systemContacts(g, this.selected ?? undefined).find(c=>c.id===this.selected);
      if (!target) { g.toast("SELECT A DESTINATION FIRST."); return; }
      if (fs.localTarget?.id===target.id) { fs.localTarget=null; fs.autopilot=false; g.toast("LOCAL DESTINATION CLEARED."); }
      else { fs.localTarget={systemId:g.world.player.systemId,id:target.id}; g.world.player.navTarget=null; delete g.world.player.navStationId; g.world.player.singersCourse=false; fs.autopilot=false; g.toast("DESTINATION SET. CLOSE THE MAP AND PRESS N TO FLY THERE."); }
    }
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    if (this.info) { this.info.draw(g, ctx); return; }
    const p=g.world.player, sys=g.world.systems[p.systemId], fs=g.scenes.flight as FlightScene;
    mapFrame(ctx,`SYSTEM MAP / ${sys.name.toUpperCase()}`,"SELECT A CONTACT / * CHOSEN OBJECTIVE / Q QUEST LOCATION");
    if (stormBlind(g.world,sys.id)) { drawText(ctx,"ION STORM / CHART UNAVAILABLE",20,115,PAL.warn);drawText(ctx,"TAB OR ESC CLOSE / G GALAXY",20,250,PAL.grey);return; }
    const quests=questLocations(g.world).filter(q=>q.systemId===sys.id);
    const contacts=this.contacts(g), selected=systemContacts(g, this.selected ?? undefined).find(c=>c.id===this.selected);
    ctx.save();ctx.beginPath();ctx.rect(MAP_RECT.x+1,MAP_RECT.y+1,MAP_RECT.w-2,MAP_RECT.h-2);ctx.clip();
    const origin=this.camera.project({x:0,y:0});ctx.strokeStyle="#172237";
    for (const pl of sys.planets) { ctx.beginPath();ctx.arc(origin.x,origin.y,pl.orbit*this.camera.scale,0,Math.PI*2);ctx.stroke(); }
    ctx.fillStyle=sys.sunColor;ctx.beginPath();ctx.arc(origin.x,origin.y,Math.max(3,sys.sunRadius*this.camera.scale),0,Math.PI*2);ctx.fill();
    const you=this.camera.project(p);
    if (selected) { const at=this.camera.project(selected);ctx.strokeStyle=PAL.gold;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(you.x,you.y);ctx.lineTo(at.x,at.y);ctx.stroke();ctx.setLineDash([]); }
    const labels:MapLabel[]=[];
    for (const c of contacts) {
      const at=this.camera.project(c);ctx.fillStyle=c.color;ctx.fillRect(at.x-2,at.y-2,4,4);
      if (c.quests?.length) drawQuestMarker(ctx,at.x,at.y,c.quests.some(q=>q.ready));
      if (c.id===this.selected) { ctx.strokeStyle=PAL.white;ctx.strokeRect(at.x-5.5,at.y-5.5,11,11); }
      labels.push({id:c.id,text:`${c.quests?.some(q=>q.focused) ? "* " : c.quests?.length ? "Q " : ""}${c.name.toUpperCase()}`,...at,color:c.quests?.length ? PAL.gold : c.color,priority:c.quests?.some(q=>q.focused) ? 110 : c.id===this.selected ? 100 : c.quests?.length ? 85 : c.kind==="STATION" ? 60 : c.kind==="WRECK" ? 50 : 0});
    }
    ctx.save();ctx.translate(you.x,you.y);ctx.rotate(p.angle);ctx.fillStyle=PAL.white;ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-4,-4);ctx.lineTo(-2,0);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();ctx.restore();
    labels.push({id:"you",text:"YOU",...you,color:PAL.white,priority:90});this.labels=drawMapLabels(ctx,labels);ctx.restore();
    drawText(ctx,clippedText(selected?.name.toUpperCase() ?? "NO DESTINATION SELECTED",146),318,39,PAL.white);
    if (selected) {
      drawText(ctx,`${selected.kind} / ${Math.round(Math.hypot(selected.x-p.x,selected.y-p.y))}M`,318,51,selected.color);
      drawText(ctx,clippedText(selected.detail,146),318,63,PAL.grey);
    } else drawText(ctx,"CLICK A MARKER OR A LIST ROW",318,54,PAL.grey);
    const objective = selected?.quests?.[0];
    ctx.strokeStyle = PAL.uiBorder; ctx.strokeRect(DETAILS.x, DETAILS.y, DETAILS.w, DETAILS.h);
    drawText(ctx, `I DETAILS / ${selected?.quests?.length ?? 0} OBJECTIVES`, 320, 78, PAL.ui);
    if (objective) {
      drawText(ctx, clippedText(`${objective.focused ? "CHOSEN" : objective.ready ? "READY" : "QUEST"}: ${objective.title.toUpperCase()}`, 142), 320, 89, objective.ready ? PAL.good : PAL.gold);
      drawText(ctx, clippedText(objective.action, 142), 320, 100, PAL.gold);
    } else drawText(ctx, quests.length ? "O SHOWS ALL SYSTEM OBJECTIVES" : "READ LOCATION AND APPROACH DETAILS", 320, 94, PAL.greyDark);
    drawText(ctx,`${this.filter} CONTACTS / ${contacts.length}`,318,115,PAL.greyDark);
    this.drawnRows = contacts.slice(this.scroll,this.scroll+7).map(c=>c.id);
    contacts.slice(this.scroll,this.scroll+7).forEach((c,i)=>{const y=127+i*12;if(c.id===this.selected){ctx.fillStyle="#20374b";ctx.fillRect(316,y,152,12);}drawText(ctx,clippedText(`${c.quests?.some(q=>q.focused) ? "* " : c.quests?.length ? "Q " : ""}${c.name.toUpperCase()}`,140),320,y+3,c.quests?.length ? PAL.gold : c.color);});
    drawText(ctx,contacts.length ? `${this.scroll+1}..${Math.min(this.scroll+7,contacts.length)} / ${contacts.length} / SCROLL LIST` : "NO CONTACTS IN THIS CATEGORY",318,215,PAL.greyDark);
    mapButton(ctx,QUESTS,`Q QUESTS ${quests.length}`,this.filter==="QUEST");
    mapButton(ctx,OBJECTIVES,"O OBJECTIVES");
    mapButton(ctx,{x:8,y:231,w:50,h:15},"HOME FIT");
    FILTERS.forEach((f,i)=>mapButton(ctx,{x:62+i*34,y:231,w:32,h:15},f==="STATION"?"PORTS":f==="PLANET"?"WORLDS":f.slice(0,5),this.filter===f));
    mapButton(ctx,{x:312,y:231,w:78,h:15},fs.localTarget?.id===this.selected ? "N CLEAR" : "N PLOT",fs.localTarget?.id===this.selected);
    mapButton(ctx,{x:394,y:231,w:78,h:15},"A FLY THERE");
    drawText(ctx,"WHEEL ZOOM / RIGHT DRAG OR ARROWS PAN / [ ] SELECT",8,250,PAL.greyDark);
    drawText(ctx,"TAB OR ESC CLOSE / G GALAXY / TIME PAUSED",8,261,PAL.grey);
  }
}
