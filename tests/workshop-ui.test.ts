// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkshopScene } from "../src/scenes/workshop";
import { Game } from "../src/game";
import { generateWorld } from "../src/world";
import { workshop, tickWorkshop, TECHNOLOGIES } from "../src/core/workshop";
import { updateVoyageSystems } from "../src/core/runtime";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
function fixture() {
  const scene=new WorkshopScene(), world=generateWorld(432), keys=new Set<string>();
  world.player.materials={iron:60,nickel:60,carbon:60,germanium:60,vanadium:60,polonium:60}; world.player.cargo={}; world.player.cargoMax=20;
  const g=Object.assign(Object.create(Game.prototype),{world,sceneName:"workshop",scene,frontend:false,input:{flush:()=>keys.clear(),down:new Set(),wasPressed:(k:string)=>keys.has(k)},scenes:{workshop:scene,flight:{resumeNext:false,enter:vi.fn()}},autosave:vi.fn(),toast:vi.fn()}) as Game;
  scene.enter(g); return {g,scene,p:world.player,keys};
}
const click=(s:string)=>document.querySelector<HTMLButtonElement>(s)!.click();
describe("workshop controls",()=>{
  it("explains full material storage and opens recipes that consume that material",()=>{
    const {p}=fixture(); expect(document.body.textContent).toContain("Nickel · 60/60 · Full");
    click('[data-action="use-nickel"]'); expect(document.body.textContent).toContain("Recipes using Nickel");
    click('[data-action="craft-parts-1"]'); expect(workshop(p).queue[0].recipe).toBe("parts");
  });
  it("keeps scroll and keyboard focus when stock changes during production",()=>{
    const {g,scene,p}=fixture(); click('[data-page="craft"]'); const root=document.querySelector<HTMLElement>('#workshop-screen')!;
    const b=document.querySelector<HTMLButtonElement>('[data-action="craft-parts-1"]')!; b.focus(); root.scrollTop=600; b.click();
    for(let i=0;i<24;i++) tickWorkshop(p,.25); scene.update(g,.3);
    expect(root.scrollTop).toBe(600); expect((document.activeElement as HTMLElement).dataset.action).toBe("craft-parts-1"); expect(p.cargo.parts).toBe(1);
  });
  it("keeps all seven research nodes and their parent requirements visible",()=>{
    fixture(); click('[data-page="research"]'); expect(document.querySelectorAll('[data-research]')).toHaveLength(TECHNOLOGIES.length);
    expect(document.body.textContent).toContain("Requires: Fabrication → Production control");
    expect(document.querySelector<HTMLButtonElement>('[data-action="research-automation"]')!.disabled).toBe(true);
  });
  it("removes its HTML and returns to the existing flight on Escape",()=>{
    const {g}=fixture(); document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    expect(g.sceneName).toBe('flight'); expect(document.querySelector('#workshop-screen')).toBeNull(); expect((g.scenes.flight as any).resumeNext).toBe(true);
  });
  it("does not advance production on the title or a map",()=>{
    const {g,p}=fixture(); workshop(p).queue=[{recipe:'parts',remaining:1,progress:0}];
    g.frontend=true; updateVoyageSystems(g,.25); expect(workshop(p).queue[0].progress).toBe(0);
    // Active chart time is excluded before the normal voyage systems run.
    g.frontend=false; g.sceneName='galaxy'; updateVoyageSystems(g,.25); expect(workshop(p).queue[0].progress).toBe(0);
  });
});
