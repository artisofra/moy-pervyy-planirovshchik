import{test}from'node:test';import assert from'node:assert/strict';import{readFile,readdir}from'node:fs/promises';import{RUNTIME_FILES,DELIVERY_FILES}from'../tools/runtime-files.js';import{releaseManifest,configSource}from'../tools/release.js';import schema from'../schema-data.js';
test('Поставка воспроизводится из исходников: список, версия и каждый хеш совпадают',async()=>{
 const manifest=await releaseManifest(process.cwd());assert.equal(await readFile('app-assets.js','utf8'),configSource(manifest));
 const walk=async(dir,prefix='')=>{const list=[];for(const entry of await readdir(dir,{withFileTypes:true})){const file=prefix+entry.name;if(entry.isDirectory())list.push(...await walk(dir+'/'+entry.name,file+'/'));else list.push(file);}return list;};
 assert.deepEqual((await walk('output/release/stroiplan')).sort(),[...DELIVERY_FILES].sort());for(const file of DELIVERY_FILES)assert.deepEqual(await readFile(file),await readFile('output/release/stroiplan/'+file));assert.equal(RUNTIME_FILES.length,23);
});
test('Manifest и PNG-иконки автономны; JSON Schema соответствует проверяемой копии',async()=>{
 const manifest=JSON.parse(await readFile('manifest.webmanifest'));assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
 for(const[filename,size]of[['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]){const bytes=await readFile('icons/'+filename);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
 assert.deepEqual(schema,JSON.parse(await readFile('file-format.schema.json')));
});
test('Сервер отдаёт интерфейс и нужный MIME, закрывает документацию, тесты, репозиторий и обход пути',async()=>{
 for(const file of DELIVERY_FILES){const response=await fetch('http://127.0.0.1:4173/'+file);assert.equal(response.status,200,file);if(file.endsWith('.js'))assert.match(response.headers.get('content-type'),/javascript/);if(file.endsWith('.webmanifest'))assert.match(response.headers.get('content-type'),/manifest\+json/);}
 for(const file of['tz.md','plan.md','.git/config','tests/domain.test.js','output/step5-performance.json','%2e%2e%2ftz.md'])assert.equal((await fetch('http://127.0.0.1:4173/'+file)).status,404,file);
});
test('Код поставки не содержит внешних скриптов, отправки планов и отладочного вывода данных',async()=>{
 for(const file of RUNTIME_FILES.filter(f=>f.endsWith('.js'))){const source=await readFile(file,'utf8');assert.doesNotMatch(source,/\b(?:eval|Function)\s*\(|\.innerHTML\s*=|console\.(?:log|info|debug)\s*\(|sendBeacon\s*\(|new\s+(?:WebSocket|XMLHttpRequest)\s*\(/,file);}
 const html=await readFile('index.html','utf8');assert.doesNotMatch(html,/<script[^>]+src=["']https?:/);assert.match(html,/worker-src 'self'/);assert.match(html,/manifest-src 'self'/);
});
