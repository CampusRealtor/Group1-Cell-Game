/* Full game: named organelle food + 10 enemies + leaderboard + minimap.
   AI fixed: persistent targets, wander, safe removal of dead items.
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');

function resizeCanvas(){
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  // minimap pixel scaling (we don't use devicePixelRatio here to keep it readable)
  mini.style.width = mini.width + 'px';
  mini.style.height = mini.height + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- settings ---
const WORLD_W = 3000;
const WORLD_H = 2000;
const INITIAL_PLAYER_RADIUS = 12;
const INITIAL_FOOD_COUNT = 250; // tune for performance
const ENEMY_COUNT = 10;

const ORGANELLES = [
  "Nucleus","Nucleolus","Nuclear Pore","Ribosome",
  "Rough ER","Smooth ER","Microtubule","Cytoplasm",
  "Mitochondrion","Lysosome","Golgi Body","Centrioles"
];

const uiScore = document.getElementById('score');
const uiSize = document.getElementById('size');
const restartBtn = document.getElementById('restart');
const leaderboardEl = document.getElementById('leaderboard');

function rand(min, max){ return Math.random() * (max - min) + min; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// --- classes ---
class Food {
  constructor(x,y,r){
    this.x = x; this.y = y; this.r = r;
    this.name = pick(ORGANELLES);
    this.color = `hsl(${rand(30,220)} 65% ${rand(35,60)}%)`;
    this.dead = false;
  }
  draw(offset){
    ctx.beginPath();
    ctx.arc(this.x - offset.x, this.y - offset.y, this.r, 0, Math.PI*2);
    ctx.fillStyle = this.color;
    ctx.fill();
    // label
    ctx.fillStyle = "#fff";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(this.name, this.x - offset.x, this.y - offset.y - this.r - 3);
  }
}

class Cell {
  constructor(x,y,r,color,name=""){
    this.x = x; this.y = y; this.r = r; this.color = color;
    this.vx = 0; this.vy = 0;
    this.name = name;
    this.alive = true;
  }
  moveToward(pos){
    const dx = pos.x - this.x;
    const dy = pos.y - this.y;
    const dist = Math.hypot(dx,dy) || 1;
    const angle = Math.atan2(dy,dx);
    const baseSpeed = 3.0;
    const speed = Math.max(0.45, baseSpeed * (INITIAL_PLAYER_RADIUS / this.r));
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.x += this.vx;
    this.y += this.vy;
    this.x = Math.max(this.r, Math.min(WORLD_W - this.r, this.x));
    this.y = Math.max(this.r, Math.min(WORLD_H - this.r, this.y));
  }
  draw(offset){
    // body
    ctx.beginPath();
    ctx.arc(this.x - offset.x, this.y - offset.y, this.r, 0, Math.PI*2);
    ctx.fillStyle = this.color;
    ctx.fill();
    // subtle nucleus
    ctx.beginPath();
    ctx.arc(this.x - offset.x + this.r*0.18, this.y - offset.y - this.r*0.14, Math.max(2, this.r*0.36), 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    // name label
    if(this.name){
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(10, Math.floor(this.r/2))}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText(this.name, this.x - offset.x, this.y - offset.y - this.r - 6);
    }
  }
  eat(other){
    this.r = Math.sqrt(this.r*this.r + other.r*other.r);
  }
}

class Enemy extends Cell {
  constructor(x,y,r,color,name=""){
    super(x,y,r,color,name);
    this.target = null;            // Food or Cell or wander point
    this.nextTargetTime = 0;
    this.wanderPoint = null;
  }

  isTargetValid(foods, player, enemies){
    if(!this.target) return false;
    if(this.target.isWander) return true;
    if(this.target instanceof Food) return (!this.target.dead && foods.indexOf(this.target) !== -1);
    if(this.target instanceof Cell) return (this.target.alive && (this.target === player || enemies.indexOf(this.target) !== -1));
    return false;
  }

  pickTarget(foods, player, enemies){
    // 1) prefer nearer smaller cell (within detection)
    const detection = 900;
    let best = null, bestD = Infinity;
    const candidates = [player, ...enemies.filter(e => e !== this && e.alive)];
    for(const c of candidates){
      if(c.alive && c.r < this.r * 0.95){
        const d = Math.hypot(c.x - this.x, c.y - this.y);
        if(d < bestD && d < detection){ best = c; bestD = d; }
      }
    }
    if(best){
      this.target = best;
      this.nextTargetTime = Date.now() + rand(600, 1200);
      return;
    }
    // 2) nearest food
    best = null; bestD = Infinity;
    for(const f of foods){
      if(f.dead) continue;
      const d = Math.hypot(f.x - this.x, f.y - this.y);
      if(d < bestD){ best = f; bestD = d; }
    }
    if(best){
      this.target = best;
      this.nextTargetTime = Date.now() + rand(800, 1600);
      return;
    }
    // 3) wander
    this.wanderPoint = { x: rand(this.x - 400, this.x + 400), y: rand(this.y - 400, this.y + 400), isWander:true };
    // clamp
    this.wanderPoint.x = Math.max(this.r, Math.min(WORLD_W - this.r, this.wanderPoint.x));
    this.wanderPoint.y = Math.max(this.r, Math.min(WORLD_H - this.r, this.wanderPoint.y));
    this.target = this.wanderPoint;
    this.nextTargetTime = Date.now() + rand(700, 2000);
  }

  updateBehavior(foods, player, enemies){
    const now = Date.now();
    if(!this.isTargetValid(foods, player, enemies) || now > this.nextTargetTime){
      this.pickTarget(foods, player, enemies);
    }
    if(this.target){
      this.moveToward({x: this.target.x, y: this.target.y});
    } else {
      this.moveToward({x: this.x + rand(-10,10), y: this.y + rand(-10,10)});
    }
  }
}

// --- state ---
let foods = [];
let enemies = [];
let player = null;
let camera = { x:0, y:0 };
let mouse = { x: window.innerWidth/2, y: window.innerHeight/2 };
let gameOver = false;

function spawnFood(n){
  for(let i=0;i<n;i++){
    const x = rand(0,WORLD_W);
    const y = rand(0,WORLD_H);
    const r = rand(4,7);
    foods.push(new Food(x,y,r));
  }
}
function spawnEnemies(n){
  enemies = [];
  for(let i=0;i<n;i++){
    const startR = rand(INITIAL_PLAYER_RADIUS*0.9, INITIAL_PLAYER_RADIUS*1.9);
    enemies.push(new Enemy(rand(0,WORLD_W), rand(0,WORLD_H), startR, `hsl(${rand(0,360)} 70% 50%)`, `Cell ${i+1}`));
  }
}
function resetGame(){
  foods = []; enemies = [];
  spawnFood(INITIAL_FOOD_COUNT);
  player = new Cell(WORLD_W/2, WORLD_H/2, INITIAL_PLAYER_RADIUS, 'hsl(200 70% 55%)', 'You');
  spawnEnemies(ENEMY_COUNT);
  camera.x = player.x - window.innerWidth/2;
  camera.y = player.y - window.innerHeight/2;
  gameOver = false;
}
resetGame();

// input
window.addEventListener('mousemove', (e)=>{ mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('touchmove', (e)=>{
  if(e.touches && e.touches[0]){ mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
}, {passive:true});
restartBtn.addEventListener('click', ()=> resetGame());

// --- helpers ---
function areaRankKey(c){ return c.r * c.r; } // mass approx
function updateLeaderboard(){
  // collect all alive cells
  const list = [];
  if(player && player.alive) list.push({ name: player.name, r: player.r, id: 'YOU' });
  for(const e of enemies) if(e.alive) list.push({ name: e.name, r: e.r, id: e.name });
  // sort by area descending
  list.sort((a,b)=> b.r*b.r - a.r*a.r);
  // top5
  const top = list.slice(0,5);
  // render
  leaderboardEl.innerHTML = '';
  for(let i=0;i<top.length;i++){
    const it = top[i];
    const li = document.createElement('li');
    li.textContent = `${i+1}. ${it.name} — ${Math.round(it.r)}`;
    leaderboardEl.appendChild(li);
  }
  // show player's rank if not in top5
  if(player && player.alive){
    const pIndex = list.findIndex(x => x.id === 'YOU');
    if(pIndex >= 5 || pIndex === -1){
      const li = document.createElement('li');
      li.textContent = `...`;
      leaderboardEl.appendChild(li);
      const li2 = document.createElement('li');
      li2.textContent = `${pIndex+1}. You — ${Math.round(player.r)}`;
      leaderboardEl.appendChild(li2);
    }
  }
}

function drawMiniMap(){
  // clear
  mctx.clearRect(0,0,mini.width, mini.height);
  // background
  mctx.fillStyle = 'rgba(0,0,0,0.35)';
  mctx.fillRect(0,0,mini.width, mini.height);
  // scale factors
  const sx = mini.width / WORLD_W;
  const sy = mini.height / WORLD_H;
  // draw foods as tiny dots
  for(const f of foods){
    mctx.fillStyle = '#99cc99';
    mctx.fillRect(f.x * sx, f.y * sy, 2, 2);
  }
  // enemies
  for(const e of enemies){
    if(!e.alive) continue;
    mctx.fillStyle = '#ff7373';
    mctx.fillRect(e.x * sx, e.y * sy, 3, 3);
  }
  // player highlighted
  if(player && player.alive){
    mctx.fillStyle = '#83b3ff';
    mctx.fillRect(player.x * sx - 1, player.y * sy - 1, 4, 4);
  }
  // border
  mctx.strokeStyle = 'rgba(255,255,255,0.12)';
  mctx.strokeRect(0,0,mini.width, mini.height);
}

// --- main loop ---
function gameLoop(){
  // convert mouse to world space
  const worldMouse = { x: camera.x + mouse.x, y: camera.y + mouse.y };

  if(!gameOver){
    // player follows mouse
    if(player && player.alive) player.moveToward(worldMouse);

    // update enemies
    for(const e of enemies) if(e.alive) e.updateBehavior(foods, player, enemies);

    // FOOD EATING: mark dead, remove later
    for(const f of foods){
      if(f.dead) continue;
      // player
      if(player && player.alive && Math.hypot(player.x - f.x, player.y - f.y) < player.r + f.r){
        player.eat(f); f.dead = true; continue;
      }
      // enemies
      for(const e of enemies){
        if(!e.alive) continue;
        if(Math.hypot(e.x - f.x, e.y - f.y) < e.r + f.r){
          e.eat(f); f.dead = true; break;
        }
      }
    }
    // remove dead foods and refill
    const before = foods.length;
    foods = foods.filter(f => !f.dead);
    const removed = before - foods.length;
    if(removed > 0) spawnFood(removed);

    // PLAYER vs ENEMIES
    for(const e of enemies){
      if(!e.alive) continue;
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      if(d < Math.max(1, player.r + e.r)){
        if(player.r > e.r * 1.08){
          player.eat(e); e.alive = false;
        } else if (e.r > player.r * 1.08){
          // player eaten — show overlay, stop updates
          gameOver = true;
        }
      }
    }

    // ENEMY vs ENEMY (pairwise i<j)
    for(let i=0;i<enemies.length;i++){
      const a = enemies[i];
      if(!a.alive) continue;
      for(let j=i+1;j<enemies.length;j++){
        const b = enemies[j];
        if(!b.alive) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if(d < Math.max(1, a.r + b.r)){
          if(a.r > b.r * 1.08){
            a.eat(b); b.alive = false;
          } else if(b.r > a.r * 1.08){
            b.eat(a); a.alive = false;
          }
        }
      }
    }
    // remove dead enemies once per frame
    enemies = enemies.filter(e => e.alive);

    // clamp camera
    camera.x = player.x - window.innerWidth/2;
    camera.y = player.y - window.innerHeight/2;
    camera.x = Math.max(0, Math.min(WORLD_W - window.innerWidth, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_H - window.innerHeight, camera.y));
  }

  // ---- render world ----
  ctx.fillStyle = '#06131c';
  ctx.fillRect(0,0,window.innerWidth, window.innerHeight);

  // subtle grid
  const gridSize = 100;
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = '#ffffff';
  for(let gx = - (camera.x % gridSize); gx < window.innerWidth; gx += gridSize){
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, window.innerHeight); ctx.stroke();
  }
  for(let gy = - (camera.y % gridSize); gy < window.innerHeight; gy += gridSize){
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(window.innerWidth, gy); ctx.stroke();
  }
  ctx.restore();

  // draw foods, enemies, player
  for(const f of foods) f.draw(camera);
  for(const e of enemies) if(e.alive) e.draw(camera);
  if(player && player.alive) player.draw(camera);

  // HUD
  const score = Math.max(0, Math.floor(player.r*player.r - INITIAL_PLAYER_RADIUS*INITIAL_PLAYER_RADIUS));
  uiScore.textContent = `Score: ${score}`;
  uiSize.textContent = `Size: ${player.r.toFixed(1)}`;

  // minimap + leaderboard
  drawMiniMap();
  updateLeaderboard();

  // game over overlay
  if(gameOver){
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0,0,window.innerWidth, window.innerHeight);
    ctx.fillStyle = "white";
    ctx.font = "48px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", window.innerWidth/2, window.innerHeight/2 - 10);
    ctx.font = "18px Arial";
    ctx.fillText("Click Restart to play again", window.innerWidth/2, window.innerHeight/2 + 30);
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
