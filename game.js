
/*
Full game.js
Features:
- Player (good cell, blue) and enemies (bad bacteria, red)
- Food with organelle names
- Minimap, leaderboard
- Mouse follow (desktop) + touch-drag anywhere (mobile)
- Frosted glass background, cell/bacteria drawing
- Simple procedural sounds using WebAudio (keeps file small)
- Death overlay with fade
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');

function resize(){
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(ratio,0,0,ratio,0,0);

  // minimap size keep as DOM pixels
  mini.width = mini.clientWidth;
  mini.height = mini.clientHeight;
}
window.addEventListener('resize', resize);
resize();

// settings
const WORLD_W = 3200;
const WORLD_H = 2200;
const INITIAL_RADIUS = 14;
let FOOD_COUNT = 240;
const BASE_ENEMIES = 10;

// organelle names (from earlier)
const ORGANELLES = [
  "Nucleus","Nucleolus","Nuclear Pore","Ribosome",
  "Rough ER","Smooth ER","Microtubule","Cytoplasm",
  "Mitochondrion","Lysosome","Golgi Body","Centrioles"
];

// UI refs
const uiScore = document.getElementById('score');
const uiSize = document.getElementById('size');
const uiLeaderboard = document.getElementById('leaderboard');
const restartBtn = document.getElementById('restart');
const instructions = document.getElementById('instructions');

// utilities
const rand = (a,b)=> Math.random()*(b-a)+a;
const pick = (arr)=> arr[Math.floor(Math.random()*arr.length)];

// audio (webaudio synth for small sounds)
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioCtx();

function playPop(){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(800, audioCtx.currentTime);
  g.gain.setValueAtTime(0.001, audioCtx.currentTime);
  g.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime+0.01);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.25);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime+0.3);
}
function playGulp(){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime+0.35);
  g.gain.setValueAtTime(0.001, audioCtx.currentTime);
  g.gain.linearRampToValueAtTime(0.16, audioCtx.currentTime+0.02);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.6);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime+0.6);
}
function playDeath(){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(120, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime+1.2);
  g.gain.setValueAtTime(0.001, audioCtx.currentTime);
  g.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime+0.02);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+1.4);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime+1.4);
}

// state
let foods = [];
let enemies = [];
let player = null;
let camera = {x:0,y:0};
let mouse = {x: window.innerWidth/2, y: window.innerHeight/2};
let touchActive = false;
let gameOver = false;
let killerName = '';

// responsive enemy count
function enemyCountForScreen(){
  const area = window.innerWidth * window.innerHeight;
  return Math.max(BASE_ENEMIES, Math.floor(area / (900*600))); // scale up on big screens
}

// classes
class Food {
  constructor(x,y,r){
    this.x = x; this.y = y; this.r = r;
    this.name = pick(ORGANELLES);
    this.color = `hsl(${rand(30,220)} 70% ${rand(40,60)}%)`;
    this.dead = false;
  }
  draw(offset){
    // simple bright dot
    ctx.beginPath();
    ctx.arc(this.x - offset.x, this.y - offset.y, this.r, 0, Math.PI*2);
    ctx.fillStyle = this.color;
    ctx.fill();
    // name
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `${Math.max(9, Math.floor(this.r))}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(this.name, this.x - offset.x, this.y - offset.y - this.r - 4);
  }
}

class Cell {
  constructor(x,y,r,color,name=''){
    this.x = x; this.y = y; this.r = r; this.color = color;
    this.vx=0; this.vy=0; this.name = name; this.alive = true;
  }
  speedFactor(){
    const base = 3.0;
    return Math.max(0.45, base * (INITIAL_RADIUS / this.r));
  }
  moveToward(pos){
    const dx = pos.x - this.x;
    const dy = pos.y - this.y;
    const dist = Math.hypot(dx,dy) || 1;
    const angle = Math.atan2(dy,dx);
    const s = this.speedFactor();
    this.vx = Math.cos(angle)*s;
    this.vy = Math.sin(angle)*s;
    this.x += this.vx;
    this.y += this.vy;
    this.x = Math.max(this.r, Math.min(WORLD_W - this.r, this.x));
    this.y = Math.max(this.r, Math.min(WORLD_H - this.r, this.y));
  }
  draw(offset, isPlayer=false){
    const cx = this.x - offset.x;
    const cy = this.y - offset.y;
    // membrane gradient
    const grad = ctx.createRadialGradient(cx - this.r*0.15, cy - this.r*0.15, this.r*0.1, cx, cy, this.r);
    grad.addColorStop(0, 'rgba(255,255,255,0.25)');
    grad.addColorStop(0.2, this.color);
    grad.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.beginPath();
    ctx.arc(cx, cy, this.r, 0, Math.PI*2);
    ctx.fillStyle = grad;
    ctx.fill();
    // inner nucleus / spot
    ctx.beginPath();
    ctx.arc(cx + this.r*0.12, cy - this.r*0.12, Math.max(3, this.r*0.35), 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    // slight edge glow
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = Math.max(1, this.r*0.06);
    ctx.stroke();
    // name label
    if(this.name){
      ctx.fillStyle = isPlayer ? '#a8d6ff' : '#ffc4c4';
      ctx.font = `${Math.max(10, Math.floor(this.r/2))}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(this.name, cx, cy - this.r - 6);
    }
  }
  eat(other){
    this.r = Math.sqrt(this.r*this.r + other.r*other.r);
  }
}

class Enemy extends Cell {
  constructor(x,y,r,color,name=''){
    super(x,y,r,color,name);
    this.target = null;
    this.nextTargetTime = 0;
    this.wanderPoint = null;
  }
  isTargetValid(){
    if(!this.target) return false;
    if(this.target.isWander) return true;
    if(this.target instanceof Food) return (!this.target.dead);
    if(this.target instanceof Cell) return (this.target.alive);
    return false;
  }
  pickTarget(){
    // prefer nearby smaller cell
    const detection = 700;
    let best=null, bestD=Infinity;
    const candidates = [player, ...enemies.filter(e=>e!==this && e.alive)];
    for(const c of candidates){
      if(c && c.alive && c.r < this.r*0.95){
        const d = Math.hypot(c.x - this.x, c.y - this.y);
        if(d < bestD && d < detection){ best = c; bestD = d; }
      }
    }
    if(best){ this.target = best; this.nextTargetTime = Date.now()+rand(500,1200); return; }
    // else nearest food
    best=null; bestD=Infinity;
    for(const f of foods){
      if(f.dead) continue;
      const d = Math.hypot(f.x - this.x, f.y - this.y);
      if(d < bestD){ best = f; bestD = d; }
    }
    if(best){ this.target = best; this.nextTargetTime = Date.now()+rand(700,1600); return; }
    // wander point
    this.wanderPoint = { x: Math.max(this.r, Math.min(WORLD_W-this.r, this.x + rand(-400,400))),
                         y: Math.max(this.r, Math.min(WORLD_H-this.r, this.y + rand(-400,400))),
                         isWander:true };
    this.target = this.wanderPoint;
    this.nextTargetTime = Date.now()+rand(800,2200);
  }
  updateBehavior(){
    const now = Date.now();
    if(!this.isTargetValid() || now > this.nextTargetTime) this.pickTarget();
    if(this.target) this.moveToward({x:this.target.x, y:this.target.y});
    else this.moveToward({x:this.x+rand(-10,10), y:this.y+rand(-10,10)});
  }
}

// initialize world
function spawnFood(n){
  for(let i=0;i<n;i++){
    foods.push(new Food(rand(0,WORLD_W), rand(0,WORLD_H), rand(4,7)));
  }
}
function spawnEnemies(n){
  enemies = [];
  for(let i=0;i<n;i++){
    enemies.push(new Enemy(rand(0,WORLD_W), rand(0,WORLD_H), rand(INITIAL_RADIUS*0.9, INITIAL_RADIUS*1.8),
                           `hsl(${rand(0,30)} 80% ${rand(40,55)}%)`, `Bac ${i+1}`));
  }
}
function reset(){
  foods = []; enemies = [];
  const count = Math.max(BASE_ENEMIES, enemyCountForScreen());
  spawnFood(FOOD_COUNT);
  spawnEnemies(count);
  player = new Cell(WORLD_W/2, WORLD_H/2, INITIAL_RADIUS, 'hsl(200 80% 60%)', 'You');
  camera.x = player.x - window.innerWidth/2;
  camera.y = player.y - window.innerHeight/2;
  gameOver = false;
  killerName = '';
}
function enemyCountForScreen(){
  const area = window.innerWidth * window.innerHeight;
  return Math.max(BASE_ENEMIES, Math.floor(area / (1000*700)));
}
reset();

// input handling: mouse follow on desktop, touch-drag anywhere on mobile
let isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
window.addEventListener('mousemove', e=>{ if(!isTouchDevice){ mouse.x = e.clientX; mouse.y = e.clientY; } });
window.addEventListener('touchstart', e=>{ isTouchDevice=true; if(e.touches[0]){ mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; touchActive=true; } }, {passive:true});
window.addEventListener('touchmove', e=>{ if(e.touches[0]){ mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; touchActive=true; } }, {passive:true});
window.addEventListener('touchend', e=>{ touchActive=false; }, {passive:true});

// restart button
restartBtn.addEventListener('click', ()=>{
  try{ audioCtx.resume(); } catch(e){}
  reset();
});

// main loop
function gameLoop(){
  // determine world target for player
  const worldMouse = { x: camera.x + mouse.x, y: camera.y + mouse.y };
  if(player && player.alive && !gameOver){
    // on desktop follow mouse; on mobile follow touch when active or follow last touch position
    if(isTouchDevice){
      if(touchActive) player.moveToward(worldMouse);
    } else {
      player.moveToward(worldMouse);
    }
  }

  // enemies update
  for(const e of enemies) if(e.alive) e.updateBehavior();

  // FOOD eating: mark dead
  for(const f of foods){
    if(f.dead) continue;
    // player eats
    if(player.alive && Math.hypot(player.x - f.x, player.y - f.y) < player.r + f.r){
      player.eat(f); f.dead=true; playPop();
      continue;
    }
    // enemies eat
    for(const e of enemies){
      if(!e.alive) continue;
      if(Math.hypot(e.x - f.x, e.y - f.y) < e.r + f.r){
        e.eat(f); f.dead=true; playPop();
        break;
      }
    }
  }
  // remove dead foods and respawn
  const before = foods.length;
  foods = foods.filter(f=>!f.dead);
  const removed = before - foods.length;
  if(removed>0) spawnFood(removed);

  // player vs enemies
  for(const e of enemies){
    if(!e.alive) continue;
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    if(d < Math.max(1, player.r + e.r)){
      if(player.r > e.r * 1.08){
        player.eat(e); e.alive=false; playGulp();
      } else if(e.r > player.r * 1.08){
        // player eaten
        killerName = e.name || 'Bacteria';
        gameOver = true;
        playDeath();
      }
    }
  }

  // enemy vs enemy
  for(let i=0;i<enemies.length;i++){
    const a = enemies[i];
    if(!a.alive) continue;
    for(let j=i+1;j<enemies.length;j++){
      const b = enemies[j];
      if(!b.alive) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if(d < Math.max(1, a.r + b.r)){
        if(a.r > b.r * 1.08){
          a.eat(b); b.alive=false; playGulp();
        } else if(b.r > a.r * 1.08){
          b.eat(a); a.alive=false; playGulp();
        }
      }
    }
  }
  enemies = enemies.filter(e=>e.alive);

  // clamp camera to player
  camera.x = player.x - window.innerWidth/2;
  camera.y = player.y - window.innerHeight/2;
  camera.x = Math.max(0, Math.min(WORLD_W - window.innerWidth, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_H - window.innerHeight, camera.y));

  // render
  render();

  requestAnimationFrame(gameLoop);
}

function render(){
  // frosted glass background
  ctx.fillStyle = '#0b2233';
  ctx.fillRect(0,0,window.innerWidth, window.innerHeight);
  // vignette / glass highlight
  const g = ctx.createLinearGradient(0,0,0,window.innerHeight);
  g.addColorStop(0,'rgba(255,255,255,0.02)');
  g.addColorStop(1,'rgba(0,0,0,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,window.innerWidth, window.innerHeight);

  // subtle moving grid for depth
  const t = Date.now() * 0.0002;
  const grid = 100;
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  const offsetX = -camera.x % grid + Math.sin(t)*6;
  const offsetY = -camera.y % grid + Math.cos(t)*6;
  for(let x = offsetX; x < window.innerWidth; x += grid){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x, window.innerHeight); ctx.stroke();
  }
  for(let y = offsetY; y < window.innerHeight; y += grid){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(window.innerWidth, y); ctx.stroke();
  }
  ctx.restore();

  // draw foods
  for(const f of foods) f.draw(camera);

  // draw enemies
  for(const e of enemies) e.draw(camera, false);

  // draw player last
  if(player) player.draw(camera, true);

  // HUD update
  uiScore.textContent = `Score: ${Math.max(0, Math.floor(player.r*player.r - INITIAL_RADIUS*INITIAL_RADIUS))}`;
  uiSize.textContent = `Size: ${player.r.toFixed(1)}`;

  // minimap and leaderboard
  drawMiniMap();
  updateLeaderboard();

  // death overlay
  if(gameOver){
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0,0,window.innerWidth, window.innerHeight);
    ctx.fillStyle = '#fff';
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('You were eaten by ' + killerName, window.innerWidth/2, window.innerHeight/2 - 10);
    ctx.font = '18px Arial';
    ctx.fillText('Click Restart to play again', window.innerWidth/2, window.innerHeight/2 + 30);
  }
}

// minimap rendering
function drawMiniMap(){
  // clear
  mctx.clearRect(0,0,mini.width, mini.height);
  // background
  mctx.fillStyle = 'rgba(0,0,0,0.25)';
  mctx.fillRect(0,0,mini.width, mini.height);
  // scale
  const sx = mini.width / WORLD_W;
  const sy = mini.height / WORLD_H;
  // foods
  for(const f of foods){
    mctx.fillStyle = '#fff';
    mctx.fillRect(f.x * sx, f.y * sy, 1.5, 1.5);
  }
  // enemies
  for(const e of enemies){
    mctx.fillStyle = '#ff6b6b';
    mctx.fillRect(e.x * sx, e.y * sy, 2.5, 2.5);
  }
  // player
  mctx.fillStyle = '#6fb3ff';
  mctx.fillRect(player.x * sx - 1.5, player.y * sy - 1.5, 3.5, 3.5);
  // border
  mctx.strokeStyle = 'rgba(255,255,255,0.08)';
  mctx.strokeRect(0,0,mini.width, mini.height);
}

// leaderboard
function updateLeaderboard(){
  const list = [];
  if(player && player.alive) list.push({name: player.name, r: player.r, id:'YOU'});
  for(const e of enemies) if(e.alive) list.push({name: e.name, r: e.r, id: e.name});
  list.sort((a,b)=> b.r*b.r - a.r*a.r);
  const top = list.slice(0,5);
  uiLeaderboard.innerHTML = '';
  const title = document.createElement('div'); title.style.fontWeight='700'; title.style.marginBottom='6px'; title.textContent='Leaderboard';
  uiLeaderboard.appendChild(title);
  for(let i=0;i<top.length;i++){
    const it = top[i];
    const div = document.createElement('div');
    div.style.marginBottom='6px';
    div.style.fontSize='13px';
    if(it.id === 'YOU') div.style.color = '#6fb3ff';
    else div.style.color = '#ffb3b3';
    div.textContent = `${i+1}. ${it.name} — ${Math.round(it.r)}`;
    uiLeaderboard.appendChild(div);
  }
  // show player rank if not in top5
  if(player && player.alive){
    const pIndex = list.findIndex(x=>x.id==='YOU');
    if(pIndex >=5){
      const sep = document.createElement('div'); sep.textContent='...'; uiLeaderboard.appendChild(sep);
      const me = document.createElement('div'); me.style.color='#6fb3ff'; me.textContent = `${pIndex+1}. You — ${Math.round(player.r)}`;
      uiLeaderboard.appendChild(me);
    }
  }
}

// start main loop
requestAnimationFrame(gameLoop);

// expose for debugging
window._game = { reset };
