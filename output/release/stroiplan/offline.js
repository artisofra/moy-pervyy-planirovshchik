const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export function startOffline({isBusy}){
  const panel=node('div');panel.id='offline-panel';const state=node('span','Подготовка работы без интернета…'),update=node('span'),message=node('span');
  state.id='offline-state';state.setAttribute('role','status');update.id='update-state';message.id='offline-message';message.setAttribute('role','status');
  const retry=node('button','Повторить подготовку'),apply=node('button','Применить обновление'),install=node('button','Установить');
  for(const b of[retry,apply,install]){b.type='button';b.hidden=true;}
  panel.append(state,update,apply,install,retry,message);document.querySelector('.workspace footer').prepend(panel);
  let registration,cacheReady=false,pendingReload=false,controlled=!!navigator.serviceWorker?.controller,installPrompt,checking=false;
  function refresh(){
    const hasUpdate=!!registration?.waiting||pendingReload;
    update.textContent=hasUpdate?'Есть обновление приложения':'';apply.hidden=!hasUpdate;
    apply.disabled=isBusy();
    if(hasUpdate&&isBusy())message.textContent='Сохраните или закройте открытые формы и предпросмотр. Ввод остаётся на месте.';
    else if(message.textContent.startsWith('Сохраните или закройте'))message.textContent='';
  }
  const unavailable=()=>!isSecureContext||!navigator.serviceWorker;
  function paint(){if(unavailable()){state.textContent=location.protocol==='file:'?'Откройте HTTPS-версию приложения.':'Для работы без интернета и установки откройте HTTPS-адрес или localhost.';retry.hidden=true;refresh();return;}state.textContent=cacheReady?(navigator.onLine?'Готово к работе без интернета':'Без интернета · файлы приложения готовы'):(navigator.onLine?'Офлайн пока не подготовлен':'Нет сети · офлайн пока не подготовлен');retry.hidden=cacheReady;refresh();}
  function ask(worker,type){return new Promise(resolve=>{if(!worker){resolve(null);return;}const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(null);},15000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};worker.postMessage({type},[channel.port2]);});}
  async function check(repair=false){
    if(unavailable()){paint();return;}if(checking)return;checking=true;retry.disabled=true;
    try{const result=await ask(navigator.serviceWorker?.controller||registration?.active,repair?'REPAIR_CACHE':'CACHE_STATUS');cacheReady=!!result?.ready;paint();}
    finally{checking=false;retry.disabled=false;}
  }
  async function register(force=false){
    if(unavailable()){paint();return;}
    try{
      const script=new URL('./sw.js',import.meta.url),existing=await navigator.serviceWorker.getRegistration(new URL('./',import.meta.url));
      registration=existing&&!force?existing:await navigator.serviceWorker.register(script,{updateViaCache:'none'});
      const watch=worker=>{if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'||worker.state==='activated'){refresh();check();}if(worker.state==='redundant'&&!cacheReady){state.textContent='Не удалось подготовить офлайн. Повторите при доступной сети.';retry.hidden=false;}});};
      watch(registration.installing);registration.addEventListener('updatefound',()=>watch(registration.installing));refresh();
      if(registration.active)await check();
      registration.update().catch(()=>{});
    }catch{state.textContent='Не удалось подготовить офлайн. Повторите при доступной сети.';retry.hidden=false;}
  }
  apply.onclick=()=>{
    if(isBusy()){refresh();return;}
    if(pendingReload){location.reload();return;}
    if(registration?.waiting){message.textContent='Применение обновления…';registration.waiting.postMessage({type:'APPLY_UPDATE'});}
  };
  retry.onclick=async()=>{if(!registration?.active)await register(true);else await check(true);};
  navigator.serviceWorker?.addEventListener('controllerchange',()=>{
    if(controlled){pendingReload=true;if(!isBusy()){location.reload();return;}}
    controlled=true;check();refresh();
  });
  window.addEventListener('online',()=>{check();registration?.update().catch(()=>{});});window.addEventListener('offline',paint);
  document.addEventListener('close',refresh,true);
  document.addEventListener('input',refresh);document.addEventListener('change',refresh);
  new MutationObserver(refresh).observe(document.body,{childList:true});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;install.hidden=false;});
  window.addEventListener('appinstalled',()=>{install.hidden=true;installPrompt=null;});
  install.onclick=async()=>{if(!installPrompt)return;const prompt=installPrompt;installPrompt=null;install.hidden=true;try{await prompt.prompt();await prompt.userChoice;}catch{message.textContent='Установка сейчас недоступна. Можно продолжить в браузере.';}};
  register();return{refresh};
}
