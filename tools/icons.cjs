const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs/promises');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH});try{
 const page=await browser.newPage(),source=await fs.readFile('icon.svg','utf8');await fs.mkdir('icons',{recursive:true});
 for(const[size,name]of [[192,'icon-192'],[512,'icon-512'],[180,'apple-touch-icon']]){await page.setViewportSize({width:size,height:size});await page.setContent('<html><body style="margin:0">'+source.replace('width="64" height="64"',`width="${size}" height="${size}"`)+'</body></html>');await page.screenshot({path:`icons/${name}.png`,omitBackground:true});}
 console.log('Local icons: 192, 512, 180 px');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
