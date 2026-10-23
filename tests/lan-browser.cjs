const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
    const page=await context.newPage(),errors=[];
    page.setDefaultTimeout(15000);
    page.on('pageerror',error=>errors.push(error.message));
    const base=process.argv[2];assert.ok(base,'Укажите URL локальной сети');
    await page.goto(base);
    await page.getByRole('heading',{name:'Пример — Сосны'}).waitFor();
    const ids=await page.evaluate(async()=>{
      if(isSecureContext)throw new Error('Нужно проверить HTTP вне localhost');
      if(typeof crypto.randomUUID!=='undefined')throw new Error('Ожидалось отсутствие randomUUID');
      const D=await import('/domain.js');
      return Array.from({length:1000},()=>D.uuid());
    });
    assert.equal(new Set(ids).size,1000);
    for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await page.getByRole('button',{name:'+ Создать объект'}).click();
    await page.getByLabel('Название *',{exact:true}).fill('Телефон — проверка');
    await page.locator('#submit-form').click();
    await page.locator('#editor').waitFor({state:'hidden'});
    await page.reload();
    await page.getByRole('heading',{name:'Телефон — проверка',exact:true}).waitFor();
    const valid=await page.evaluate(async()=>{
      const S=await import('/storage.js'),D=await import('/domain.js');
      return D.validate(await S.read(await S.openDB()));
    });
    assert.equal(valid,true);
    for(const path of ['/tz.md','/package.json','/tests/finance-fixture.js','/output/step3-browser-results.json','/.git/config']){
      const response=await context.request.get(new URL(path,base).href);
      assert.equal(response.status(),404,path);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS LAN HTTP: старт без randomUUID, 1000 UUID v4, создание через форму, сохранение после перезагрузки, валидация базы, закрытые служебные файлы, нет ошибок JS');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
