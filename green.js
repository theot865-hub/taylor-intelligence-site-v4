(() => {
  const nav = document.querySelector('.top-nav');
  const menu = document.querySelector('.m-nav-toggle');
  const disclosures = [...nav.querySelectorAll('.nav-disclosure')];
  const closeDisclosures = () => disclosures.forEach(item => { item.open = false; });
  const close = () => { closeDisclosures(); nav.classList.remove('m-open'); menu.classList.remove('is-open'); menu.setAttribute('aria-expanded','false'); menu.setAttribute('aria-label','Open menu'); };
  disclosures.forEach(item => item.addEventListener('toggle', () => {
    if (item.open) disclosures.filter(other => other !== item).forEach(other => { other.open = false; });
  }));
  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('m-open'); menu.classList.toggle('is-open',open);
    if (!open) closeDisclosures();
    menu.setAttribute('aria-expanded',String(open)); menu.setAttribute('aria-label',open?'Close menu':'Open menu');
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click',close));
  document.addEventListener('click', e => { if (!nav.contains(e.target) && !menu.contains(e.target)) close(); });
  nav.addEventListener('focusout', e => { if (e.relatedTarget && !nav.contains(e.relatedTarget)) closeDisclosures(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = disclosures.find(item => item.open);
    if (open) { open.open = false; open.querySelector('summary').focus(); }
    else if (nav.classList.contains('m-open')) { close(); menu.focus(); }
  });
  const route={services:'services',approach:'studio',contact:'start',card:'start'}[location.pathname.split('/').filter(Boolean)[0]];
  if(route&&!location.hash) requestAnimationFrame(()=>document.getElementById(route)?.scrollIntoView());
  const form=document.querySelector('form[data-lead-form]');
  form?.addEventListener('submit',async e=>{
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
