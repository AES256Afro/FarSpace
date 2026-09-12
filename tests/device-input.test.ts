// @vitest-environment happy-dom
import {afterEach,describe,expect,it,vi} from "vitest";
import {Input} from "../src/core/input";
import {Game} from "../src/game";
import {initTouch,touch,updateTouch} from "../src/core/touch";
import {saveSettings} from "../src/core/settings";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();saveSettings({keymap:{}});});
function fixture(){
  const canvas=document.createElement("canvas"),input=new Input(canvas,()=>({scale:1,ox:0,oy:0}));
  let mode:"flight"|"walk"|"menu"="walk";
  const g={input,scale:1,touchMode:()=>mode} as Game;
  const pad={connected:true,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
  vi.stubGlobal("navigator",{getGamepads:()=>[pad]});
  const key=(type:string,key:string)=>window.dispatchEvent(new KeyboardEvent(type,{key}));
  touch.stickId=-1;touch.dx=touch.dy=0;touch.buttons.clear();initTouch(canvas,g);
  const finger=(type:string,id:number,x:number,y:number)=>{const e=new Event(type,{cancelable:true});Object.defineProperty(e,"changedTouches",{value:[{identifier:id,clientX:x,clientY:y}]});canvas.dispatchEvent(e);};
  return{input,pad,key,g,canvas,finger,mode:(m:typeof mode)=>{mode=m;updateTouch(g);}};
}

describe("device input ownership",()=>{
  it("uses walking controls without adding flight actions to the D-pad",()=>{
    const {input,pad}=fixture();pad.buttons[12].pressed=true;pad.buttons[15].pressed=true;input.pollGamepad("walk");
    expect([...input.down].sort()).toEqual(["d","w"]);expect(input.wasPressed("r")).toBe(false);expect(input.wasPressed("h")).toBe(false);
    pad.buttons[12].pressed=pad.buttons[15].pressed=false;pad.buttons[3].pressed=true;input.pollGamepad("walk");expect([...input.down]).toEqual(["q"]);
  });
  it("releasing the pad or touch does not release a key still held on the keyboard",()=>{
    const {input,pad,key}=fixture();key("keydown","w");pad.axes[1]=-1;input.pollGamepad("walk");input.setTouchKeys(new Set(["w"]));
    pad.axes[1]=0;input.pollGamepad("walk");input.setTouchKeys(new Set());expect(input.isDown("w")).toBe(true);
    key("keyup","w");expect(input.isDown("w")).toBe(false);
  });
  it("keyboard release preserves a held pad key and physical aliases release independently",()=>{
    const {input,pad,key}=fixture();pad.axes[1]=-1;input.pollGamepad("walk");key("keydown","w");key("keyup","w");expect(input.isDown("w")).toBe(true);
    pad.axes[1]=0;input.pollGamepad("walk");saveSettings({keymap:{z:"w"}});key("keydown","w");key("keydown","z");key("keyup","w");expect(input.isDown("w")).toBe(true);key("keyup","z");expect(input.isDown("w")).toBe(false);
  });
  it("requires release before a held button can activate a new scene mode",()=>{
    const {input,pad}=fixture();pad.buttons[0].pressed=true;input.pollGamepad("walk");expect(input.isDown("e")).toBe(true);
    input.flush();input.pollGamepad("menu");expect(input.down.size).toBe(0);expect(input.wasPressed("Enter")).toBe(false);
    pad.buttons[0].pressed=false;input.pollGamepad("menu");pad.buttons[0].pressed=true;input.pollGamepad("menu");expect(input.wasPressed("Enter")).toBe(true);
  });
  it("releases held controls on focus loss and updates disconnected state",()=>{
    const {input,pad,key}=fixture();key("keydown","w");pad.buttons[0].pressed=true;input.pollGamepad("walk");
    input.mousePressed=true;input.mouseRightPressed=true;input.mouseDown=true;input.mouseRight=true;input.wheel=2;input.textEvents=["a"];input.lastRawKey="a";
    window.dispatchEvent(new Event("blur"));input.pollGamepad("walk");expect(input.down.size).toBe(0);expect(input.pressed.size).toBe(0);
    expect(input.mousePressed).toBe(false);expect(input.mouseRightPressed).toBe(false);expect(input.mouseDown).toBe(false);expect(input.mouseRight).toBe(false);expect(input.wheel).toBe(0);expect(input.textEvents).toEqual([]);expect(input.lastRawKey).toBeNull();
    window.dispatchEvent(new Event("focus"));pad.connected=false;input.pollGamepad("walk");expect(input.padConnected).toBe(false);
  });
});

describe("touch scene transitions",()=>{
  it("releases the stick when a reader opens, including touchend in menu mode",()=>{
    const {g,input,finger,mode}=fixture();finger("touchstart",1,40,140);finger("touchmove",1,40,100);expect(input.isDown("w")).toBe(true);
    mode("menu");expect(input.isDown("w")).toBe(false);expect(touch.stickId).toBe(-1);finger("touchend",1,40,100);mode("walk");expect(input.down.size).toBe(0);updateTouch(g);expect(input.down.size).toBe(0);
  });
  it("keeps a shared touch button held until the last finger lifts",()=>{
    const {input,finger}=fixture();finger("touchstart",1,450,220);finger("touchstart",2,450,220);expect(input.isDown("e")).toBe(true);
    finger("touchend",1,450,220);expect(input.isDown("e")).toBe(true);finger("touchcancel",2,450,220);expect(input.isDown("e")).toBe(false);
  });
  it("treats deck guide buttons as clicks and clears touches on blur",()=>{
    const {input,finger}=fixture();finger("touchstart",1,20,45);expect(input.mousePressed).toBe(true);expect(touch.stickId).toBe(-1);expect(input.mouseX).toBe(20);
    finger("touchend",1,20,45);finger("touchstart",2,40,140);finger("touchmove",2,80,140);expect(input.isDown("d")).toBe(true);window.dispatchEvent(new Event("blur"));expect(input.down.size).toBe(0);expect(touch.stickId).toBe(-1);
  });
  it("uses menu controls for a paused reader inside a walking scene",()=>{
    const g=Object.assign(Object.create(Game.prototype),{sceneName:"interior",scene:{touchMode:"walk",pausesVoyage:true}}) as Game;
    expect(g.touchMode()).toBe("menu");Object.assign(g.scene,{pausesVoyage:false});expect(g.touchMode()).toBe("walk");
  });
});


describe("small window sizing",()=>{
  it("fills an 800 pixel window while keeping larger desktop scaling unchanged",()=>{
    const canvas=document.createElement("canvas"),g=Object.assign(Object.create(Game.prototype),{canvas,ctx:{imageSmoothingEnabled:true}}) as Game;
    vi.stubGlobal("innerWidth",800);vi.stubGlobal("innerHeight",600);g.resize();expect(canvas.width).toBe(800);expect(canvas.height).toBe(450);
    vi.stubGlobal("innerWidth",1280);vi.stubGlobal("innerHeight",720);g.resize();expect(canvas.width).toBe(960);expect(canvas.height).toBe(540);
    vi.stubGlobal("innerWidth",390);vi.stubGlobal("innerHeight",844);g.resize();expect(canvas.width).toBe(390);expect(canvas.height).toBe(219);
  });
});
