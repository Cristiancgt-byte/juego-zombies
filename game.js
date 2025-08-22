// Zombie Shooter 2D - sin assets, todo dibujado en canvas
// Controles: WASD para moverse, Mouse para apuntar, Clic o ESPACIO para disparar, R para reiniciar

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ----- Estado global -----
  const state = {
    running: false,
    gameOver: false,
    lastTime: 0,
    time: 0,
    score: 0,
    best: Number(localStorage.getItem('zs_best') || 0),
    wave: 1,
  };

  // UI refs
  const elScore = document.getElementById('score');
  const elBest  = document.getElementById('best');
  const elWave  = document.getElementById('wave');
  const elHearts = document.getElementById('hearts');
  const overlay = document.getElementById('overlay');
  const btnPlay = document.getElementById('btn-play');
  const btnRestart = document.getElementById('btn-restart');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');

  elBest.textContent = `Mejor: ${state.best}`;

  // DPI correcto
  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rectW = canvas.clientWidth;
    const rectH = canvas.clientHeight;
    canvas.width = Math.floor(rectW * dpr);
    canvas.height = Math.floor(rectH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  // ----- Utilidades -----
  const rand = (a,b) => Math.random()*(b-a)+a;
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const dist2 = (x1,y1,x2,y2)=>{ const dx=x2-x1, dy=y2-y1; return dx*dx+dy*dy; };

  // ----- Entidades -----
  const player = {
    x: canvas.clientWidth/2,
    y: canvas.clientHeight/2,
    r: 16,
    speed: 240,
    hp: 5,
    maxHp: 5,
    invul: 0,
  };

  const input = { up:false, down:false, left:false, right:false, shoot:false, mx:0, my:0, aimx:0, aimy:0 };

  const bullets = [];
  const zombies = [];
  const splats = []; // partículas de "sangre"

  let shootCooldown = 0;
  const BULLET_COOLDOWN = 150; // ms

  let spawnTimer = 0;
  let spawnInterval = 1200; // ms (disminuye con el tiempo)

  // ----- Input -----
  const keyMap = { 'w':'up', 'ArrowUp':'up', 's':'down', 'ArrowDown':'down', 'a':'left', 'ArrowLeft':'left', 'd':'right', 'ArrowRight':'right', ' ': 'shoot' };
  addEventListener('keydown', (e)=>{
    const k = keyMap[e.key];
    if(k){ input[k] = true; if(k==='shoot') e.preventDefault(); }
    if(e.key.toLowerCase()==='r'){ if(state.gameOver) startGame(true); }
  });
  addEventListener('keyup', (e)=>{
    const k = keyMap[e.key]; if(k) input[k] = false;
  });

  canvas.addEventListener('mousemove', (e)=>{
    const rect = canvas.getBoundingClientRect();
    input.mx = e.clientX - rect.left;
    input.my = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', ()=>{ input.shoot = true; });
  addEventListener('mouseup', ()=>{ input.shoot = false; });

  // Toques básicos (apunta al centro del toque y dispara)
  canvas.addEventListener('touchstart', (e)=>{
    const t = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    input.mx = t.clientX - rect.left; input.my = t.clientY - rect.top; input.shoot = true;
  }, {passive:true});
  canvas.addEventListener('touchmove', (e)=>{
    const t = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    input.mx = t.clientX - rect.left; input.my = t.clientY - rect.top;
  }, {passive:true});
  canvas.addEventListener('touchend', ()=>{ input.shoot = false; }, {passive:true});

  // ----- Juego -----
  function startGame(restart=false){
    state.running = true; state.gameOver = false; state.time = 0; state.lastTime = 0; state.score = restart?0:state.score;
    player.x = canvas.clientWidth/2; player.y = canvas.clientHeight/2; player.hp = player.maxHp; player.invul=0;
    bullets.length = 0; zombies.length = 0; splats.length = 0;
    spawnInterval = 1100; spawnTimer = 0; state.wave = 1;

    overlay.classList.add('hidden');
    btnRestart.classList.add('hidden');
    btnPlay.classList.add('hidden');
    updateHearts();
  }

  function gameOver(){
    state.running = false; state.gameOver = true;
    overlayTitle.textContent = '¡Derrotado!';
    overlayText.innerHTML = `Puntaje: <b>${state.score}</b><br>Oleada: <b>${state.wave}</b>`;
    btnRestart.classList.remove('hidden');
    overlay.classList.remove('hidden');

    if(state.score > state.best){ state.best = state.score; localStorage.setItem('zs_best', String(state.best)); }
    elBest.textContent = `Mejor: ${state.best}`;
  }

  function updateHearts(){
    elHearts.innerHTML = '';
    for(let i=0;i<player.maxHp;i++){
      const d = document.createElement('div');
      d.className = 'heart' + (i < player.hp ? '' : ' empty');
      elHearts.appendChild(d);
    }
  }

  function spawnZombie(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // aparece por los bordes
    const side = Math.floor(rand(0,4));
    let x,y;
    if(side===0){ x = -20; y = rand(0,h); }
    else if(side===1){ x = w+20; y = rand(0,h); }
    else if(side===2){ x = rand(0,w); y = -20; }
    else { x = rand(0,w); y = h+20; }

    const speed = rand(40, 70) + state.wave * 6; // escala con oleada
    const r = rand(14, 20);

    zombies.push({ x, y, r, speed, hit:0 });
  }

  function shoot(){
    const now = state.time;
    if(now < shootCooldown) return;
    shootCooldown = now + BULLET_COOLDOWN; // cadencia

    const dx = input.mx - player.x;
    const dy = input.my - player.y;
    const L = Math.hypot(dx,dy) || 1;
    const dirx = dx/L, diry = dy/L;

    const speed = 620;
    bullets.push({ x: player.x + dirx*(player.r+6), y: player.y + diry*(player.r+6), vx: dirx*speed, vy: diry*speed, r: 4, life: 0.9 });
  }

  function addSplat(x,y,count=10){
    for(let i=0;i<count;i++){
      const a = rand(0, Math.PI*2), s = rand(40,140);
      splats.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: rand(0.2,0.6) });
    }
  }

  function damagePlayer(amount){
    if(player.invul>0) return;
    player.hp -= amount; player.invul = 700; // ms invulnerable
    updateHearts();
    if(player.hp<=0) gameOver();
  }

  function update(dt){
    // dificultad dinámica
    spawnTimer -= dt;
    if(spawnTimer <= 0){
      spawnZombie();
      // cada cierto tiempo, acelera spawns y sube oleada
      spawnInterval = clamp(spawnInterval - 6, 350, 2000);
      spawnTimer = spawnInterval;
    }

    // subir oleadas cada 20s
    if(Math.floor(state.time/20000)+1 !== state.wave){
      state.wave = Math.floor(state.time/20000)+1;
      elWave.textContent = `Oleada: ${state.wave}`;
    }

    // player
    const sp = player.speed * (player.invul>0?0.92:1);
    let vx = (input.right?-1:0) + (input.left?1:0); // invertimos porque dibujamos distinto? no, mantén normal
    vx = (input.right?1:0) - (input.left?1:0);
    let vy = (input.down?1:0) - (input.up?1:0);
    if(vx||vy){ const L = Math.hypot(vx,vy); vx/=L; vy/=L; }
    player.x = clamp(player.x + vx*sp*dt/1000, player.r, canvas.clientWidth - player.r);
    player.y = clamp(player.y + vy*sp*dt/1000, player.r, canvas.clientHeight - player.r);
    if(player.invul>0) player.invul -= dt;

    // disparo
    if(input.shoot) shoot();

    // balas
    for(let i=bullets.length-1;i>=0;i--){
      const b = bullets[i];
      b.x += b.vx*dt/1000; b.y += b.vy*dt/1000; b.life -= dt/1000;
      if(b.life<=0 || b.x<-20 || b.x>canvas.clientWidth+20 || b.y<-20 || b.y>canvas.clientHeight+20){ bullets.splice(i,1); }
    }

    // zombis se mueven hacia el jugador
    for(let i=zombies.length-1;i>=0;i--){
      const z = zombies[i];
      const dx = player.x - z.x; const dy = player.y - z.y; const L = Math.hypot(dx,dy)||1;
      z.x += (dx/L) * z.speed * dt/1000;
      z.y += (dy/L) * z.speed * dt/1000;
      if(z.hit>0) z.hit -= dt;

      // colisión con jugador
      const rr = (z.r + player.r);
      if(dist2(z.x,z.y,player.x,player.y) < rr*rr){
        damagePlayer(1);
        // retroceso
        z.x -= (dx/L)*26; z.y -= (dy/L)*26; z.hit = 120;
      }
    }

    // colisión bala-zombi
    for(let i=zombies.length-1;i>=0;i--){
      const z = zombies[i];
      let killed = false;
      for(let j=bullets.length-1;j>=0;j--){
        const b = bullets[j];
        const rr = (z.r + b.r);
        if(dist2(z.x,z.y,b.x,b.y) < rr*rr){
          // eliminar bala y zombi
          bullets.splice(j,1);
          killed = true; break;
        }
      }
      if(killed){
        addSplat(z.x, z.y, 12);
        zombies.splice(i,1);
        state.score += 10; elScore.textContent = `Puntos: ${state.score}`;
      }
    }

    // partículas
    for(let i=splats.length-1;i>=0;i--){
      const p = splats[i];
      p.x += p.vx*dt/1000; p.y += p.vy*dt/1000; p.vx*=0.96; p.vy*=0.96; p.life -= dt/1000;
      if(p.life<=0) splats.splice(i,1);
    }
  }

  function draw(){
    // fondo cuadriculado sutil
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#0b1017';
    ctx.fillRect(0,0,w,h);

    // grid
    ctx.save();
    ctx.globalAlpha = 0.12;
    for(let x=0; x<w; x+=32){ ctx.fillRect(x,0,1,h); }
    for(let y=0; y<h; y+=32){ ctx.fillRect(0,y,w,1); }
    ctx.restore();

    // splats
    for(const p of splats){
      ctx.globalAlpha = clamp(p.life*1.6, 0, 0.9);
      ctx.fillStyle = '#8b1e2d';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // jugador
    ctx.save();
    const blinking = (player.invul>0) && (Math.floor(state.time/60)%2===0);
    if(blinking) ctx.globalAlpha = 0.5;
    // cuerpo
    ctx.fillStyle = '#7bdcff';
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.fill();
    // cañón apuntando al mouse
    const dx = input.mx - player.x; const dy = input.my - player.y; const L = Math.hypot(dx,dy)||1; const ux=dx/L, uy=dy/L;
    ctx.strokeStyle = '#bff1ff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(player.x+ux*(player.r+14), player.y+uy*(player.r+14)); ctx.stroke();
    ctx.restore();

    // balas
    ctx.fillStyle = '#e3f6ff';
    for(const b of bullets){ ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); }

    // zombis
    for(const z of zombies){
      ctx.save();
      if(z.hit>0){ ctx.shadowColor = '#ff4d6d'; ctx.shadowBlur = 16; }
      ctx.fillStyle = '#88ff88';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI*2); ctx.fill();
      // ojos
      ctx.fillStyle = '#0b0f14';
      ctx.beginPath(); ctx.arc(z.x-5, z.y-4, 3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(z.x+5, z.y-4, 3, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // mira
    ctx.save();
    ctx.strokeStyle = '#9ad8ff'; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(input.mx, input.my, 10, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(input.mx-14, input.my); ctx.lineTo(input.mx+14, input.my); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(input.mx, input.my-14); ctx.lineTo(input.mx, input.my+14); ctx.stroke();
    ctx.restore();
  }

  function loop(ts){
    if(!state.running){ requestAnimationFrame(loop); return; }
    if(!state.lastTime) state.lastTime = ts; const dt = Math.min(34, ts - state.lastTime); // cap 34ms (~30fps min)
    state.lastTime = ts; state.time += dt;

    update(dt);
    draw();

    if(!state.gameOver) requestAnimationFrame(loop);
  }

  // UI botones
  btnPlay.addEventListener('click', ()=>{ startGame(true); requestAnimationFrame(loop); });
  btnRestart.addEventListener('click', ()=>{ startGame(true); requestAnimationFrame(loop); });

  // Mostrar overlay inicial
  overlay.classList.remove('hidden');
})();
