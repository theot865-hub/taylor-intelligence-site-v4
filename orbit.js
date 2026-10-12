/* A compact, orange interpretation of TI v1's Celestial Atlas.
   Elliptical orbits, procedural worlds and pointer-driven perspective.
   No network calls, WebGL dependencies, or generated image assets. */
(() => {
  const host = document.querySelector('.atlas-hero');
  const canvas = document.getElementById('atlas-canvas');
  if (!host || !canvas) return;
  const ctx = canvas.getContext('2d');
  const toggle = host.querySelector('.orbit-toggle');
  if (!ctx) { toggle.hidden = true; return; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const links = [...host.querySelectorAll('[data-orbit]')];
  const worlds = [
    { r: 135, size: 11, speed: .105, phase: 2.8, color: [166,119,74], label: 'Websites', url: '#/websites' },
    { r: 225, size: 21, speed: .066, phase: .2, color: [106,107,102], label: 'AI systems', url: '#/services', ring: true },
    { r: 325, size: 15, speed: .043, phase: 4.5, color: [208,153,101], label: 'Education', url: '/ai-intensive/' },
    { r: 435, size: 13, speed: .03, phase: 1.1, color: [103,73,52], label: 'Software', url: '#/software' }
  ];
  let width = 0, height = 0, scale = 1, cx = 0, cy = 0;
  let time = 15, prev = 0, frame = 0, hover = -1, visible = true;
  let paused = reduced.matches, userPaused = false, tilt = .39, targetTilt = .39;
  let turn = -.13, targetTurn = -.13;
  const positions = [];
  let seed = 1327;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const stars = Array.from({length: 75}, () => ({x:random(),y:random(),r:random()*.65+.2,a:random()*.18+.06}));
  const dust = Array.from({length: 150}, () => ({a:random()*Math.PI*2,r:random()*22+275,size:random()*.6+.3}));
  function sphere(rgb, sun = false) {
    const c = document.createElement('canvas'); c.width = c.height = 192;
    const c2 = c.getContext('2d'), pixels = c2.createImageData(192,192);
    for (let y=0;y<192;y++) for (let x=0;x<192;x++) {
      const u=(x-96)/94, v=(y-96)/94, d=u*u+v*v;
      if(d>1) continue;
      const z=Math.sqrt(1-d), grain=random();
      const bands = Math.sin(v*31+Math.sin(u*9)*2)*.08 + Math.sin(v*61+u*13)*.035;
      const light=sun ? .84+Math.max(0,z)*.18 : Math.max(.09,(-u*.48-v*.30+z*.79))*.9+.09;
      const texture=sun ? .7+grain*.38+Math.sin(u*46+Math.sin(v*32)*2)*.12 : .93+bands+(grain-.5)*.12;
      const idx=(y*192+x)*4;
      const source=sun ? [255, 144+grain*41, 38+grain*37] : rgb;
      for(let k=0;k<3;k++)pixels.data[idx+k]=Math.min(255,source[k]*light*texture);
      pixels.data[idx+3]=Math.min(1,(1-Math.sqrt(d))*70)*255;
    }
    c2.putImageData(pixels,0,0);return c;
  }
  const sun=sphere([255,160,48],true);
  worlds.forEach(w=>w.image=sphere(w.color));
  function project(r,a) {
    const x=Math.cos(a)*r*scale, y=Math.sin(a)*r*scale*tilt;
    return {x:cx+x*Math.cos(turn)-y*Math.sin(turn), y:cy+x*Math.sin(turn)+y*Math.cos(turn), depth:Math.sin(a)};
  }
  function track(r,alpha=.19) {
    ctx.beginPath();ctx.ellipse(cx,cy,r*scale,r*scale*tilt,turn,0,Math.PI*2);
    ctx.strokeStyle=`rgba(129,85,46,${alpha})`;ctx.lineWidth=.7;ctx.stroke();
  }
  function render() {
    ctx.clearRect(0,0,width,height);
    const mobile=width<701, sr=mobile?23:43*scale;
    for(const s of stars){ctx.beginPath();ctx.arc(s.x*width,s.y*height,s.r,0,Math.PI*2);ctx.fillStyle=`rgba(129,84,37,${s.a})`;ctx.fill();}
    const glow=ctx.createRadialGradient(cx,cy,sr,cx,cy,sr*7);
    glow.addColorStop(0,'rgba(250,146,39,.21)');glow.addColorStop(.3,'rgba(246,151,50,.11)');glow.addColorStop(1,'rgba(247,167,78,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    worlds.forEach((w,i)=>track(w.r,hover===i?.46:.17));
    track(485,.07);
    for(const d of dust){const p=project(d.r,d.a+time*.01);ctx.fillStyle='rgba(143,104,61,.16)';ctx.fillRect(p.x,p.y,d.size,d.size);}
    const current=worlds.map((w,i)=>{const pos=project(w.r,w.phase+time*w.speed);positions[i]=pos;return {w,i,pos};});
    function drawWorld({w,i,pos}) {
      const r=w.size*scale*(1+pos.depth*.08);
      if(w.ring){ctx.save();ctx.translate(pos.x,pos.y);ctx.rotate(-.42);ctx.beginPath();ctx.ellipse(0,0,r*1.8,r*.45,0,0,Math.PI*2);ctx.strokeStyle='rgba(120,102,74,.26)';ctx.lineWidth=r*.2;ctx.stroke();ctx.restore();}
      if(hover===i){ctx.beginPath();ctx.arc(pos.x,pos.y,r+7,0,Math.PI*2);ctx.strokeStyle='#b66028';ctx.lineWidth=.75;ctx.stroke();}
      ctx.drawImage(w.image,pos.x-r,pos.y-r,r*2,r*2);
      ctx.beginPath();ctx.arc(pos.x,pos.y,r+.8,0,Math.PI*2);ctx.strokeStyle='rgba(105,80,50,.22)';ctx.lineWidth=.7;ctx.stroke();
      if(hover===i){ctx.font=`${mobile?9:10}px Manrope,Arial,sans-serif`;ctx.textAlign='center';ctx.fillStyle=hover===i?'#984c1b':'#83725e';ctx.fillText(w.label,pos.x,pos.y+r+17);}
    }
    current.filter(p=>p.pos.depth<0).forEach(drawWorld);
    // Sun: cached procedural photosphere with a moving corona.
    for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(cx,cy,sr*(1.3+i*.32),sr*(1.3+i*.32)*(.7+i*.1),time*.018+i*.7,0,Math.PI*2);ctx.strokeStyle=`rgba(205,116,32,${.18-i*.035})`;ctx.lineWidth=.65;ctx.stroke();}
    ctx.save();ctx.translate(cx,cy);ctx.rotate(time*.012);ctx.drawImage(sun,-sr,-sr,sr*2,sr*2);ctx.restore();
    const corona=ctx.createRadialGradient(cx,cy,sr*.92,cx,cy,sr*1.45);corona.addColorStop(0,'rgba(255,167,48,.26)');corona.addColorStop(1,'rgba(255,161,45,0)');ctx.fillStyle=corona;ctx.beginPath();ctx.arc(cx,cy,sr*1.45,0,Math.PI*2);ctx.fill();
    current.filter(p=>p.pos.depth>=0).forEach(drawWorld);
    // A restrained technical signature beneath the central star.
    
  }
  function resize(){
    const bounds=host.getBoundingClientRect();width=bounds.width;height=bounds.height;
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    if(width<701){cx=width*.5;cy=height*.65;scale=width/1010;scale=Math.max(.28,scale);}
    else {cx=width*.66;cy=height*.57;scale=Math.min(width/1450,height/760);}
    render();
  }
  function tick(now){
    frame=0;if(paused||!visible||document.hidden)return;
    const dt=prev?Math.min((now-prev)/1000,.05):0;prev=now;time+=dt;
    tilt+=(targetTilt-tilt)*.035;turn+=(targetTurn-turn)*.035;render();frame=requestAnimationFrame(tick);
  }
  function schedule(){cancelAnimationFrame(frame);frame=0;prev=0;if(!paused&&visible&&!document.hidden)frame=requestAnimationFrame(tick);else render();}
  function updateToggle(){toggle.textContent=paused?'Play motion':'Pause motion';toggle.setAttribute('aria-pressed',String(paused));}
  toggle.addEventListener('click',()=>{paused=!paused;userPaused=paused;updateToggle();schedule();});
  reduced.addEventListener('change',()=>{paused=reduced.matches||userPaused;updateToggle();schedule();});
  function hit(e){const box=host.getBoundingClientRect();const x=e.clientX-box.left,y=e.clientY-box.top;return positions.findIndex((p,i)=>Math.hypot(x-p.x,y-p.y)<Math.max(17,worlds[i].size*scale+8));}
  host.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch')return;
    const box=host.getBoundingClientRect();if(!reduced.matches){targetTilt=.39+(e.clientY-box.top-height/2)/height*.1;targetTurn=-.13+(e.clientX-box.left-width/2)/width*.08;}
    hover=e.target.closest('a,button')?-1:hit(e);canvas.style.cursor=hover>=0?'pointer':'';if(paused)render();
  });
  host.addEventListener('pointerleave',()=>{hover=-1;targetTilt=.39;targetTurn=-.13;render();});
  host.addEventListener('click',e=>{if(e.target.closest('a,button'))return;const i=hit(e);if(i>=0)location.href=worlds[i].url;});
  links.forEach((a,i)=>{const enter=()=>{hover=i;render()};const leave=()=>{hover=-1;render()};a.addEventListener('pointerenter',enter);a.addEventListener('focus',enter);a.addEventListener('pointerleave',leave);a.addEventListener('blur',leave);});
  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();},{threshold:0}).observe(host);
  document.addEventListener('visibilitychange',schedule);
  window.addEventListener('hashchange',()=>requestAnimationFrame(()=>{visible=!document.getElementById('page-home').classList.contains('is-hidden');resize();schedule();}));
  document.fonts.ready.then(render);resize();updateToggle();schedule();
})();
