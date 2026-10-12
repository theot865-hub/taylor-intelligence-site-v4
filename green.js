(() => {
  const nav = document.querySelector('.top-nav');
  const menu = document.querySelector('.m-nav-toggle');
  const close = () => { nav.classList.remove('m-open'); menu.classList.remove('is-open'); menu.setAttribute('aria-expanded','false'); menu.setAttribute('aria-label','Open menu'); };
  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('m-open'); menu.classList.toggle('is-open',open);
    menu.setAttribute('aria-expanded',String(open)); menu.setAttribute('aria-label',open?'Close menu':'Open menu');
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click',close));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){close();menu.focus();}});
  const route={websites:'websites',portfolio:'websites',services:'services',approach:'studio',contact:'start',card:'start'}[location.pathname.split('/').filter(Boolean)[0]];
  if(route&&!location.hash) requestAnimationFrame(()=>document.getElementById(route)?.scrollIntoView());
  const form=document.querySelector('form[data-lead-form]');
  form.addEventListener('submit',async e=>{
    e.preventDefault(); const button=form.querySelector('button[type=submit]');button.disabled=true;button.textContent='Sending…';
    form.querySelector('.form-note')?.remove();
    try{
      const response=await fetch(form.action,{method:'POST',headers:{Accept:'application/json'},body:new FormData(form)});
      const result=await response.json();if(!response.ok||result.success!==true)throw new Error('Submission not accepted');
      const note=document.createElement('p');note.className='form-note';note.setAttribute('role','status');note.textContent='Thanks — your message has been sent. We’ll be in touch.';form.replaceWith(note);
    }catch{
      button.disabled=false;button.textContent='Send it';const note=document.createElement('p');note.className='form-note';note.setAttribute('role','alert');note.innerHTML='Your message wasn’t sent. Please try again or email <a href="mailto:theo@taylorintelligence.ai">theo@taylorintelligence.ai</a>.';form.append(note);
    }
  });
})();
