// Run against a production preview: node scripts/measure-render.mjs http://localhost:4173 [screenshot.png]
// Chromium defaults to Playwright's pinned build; set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH for a system browser.
// Software WebGL measurements are diagnostic only; validate 60 fps on actual laptop hardware.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1280,height:720}});
await page.goto(process.argv[2] || 'http://localhost:4173', {waitUntil:'domcontentloaded'});
await page.click('text=PRESS START', {force:true});
await page.click('[data-m=training]');
await page.click('[data-a=start]');
await page.waitForFunction(()=>window.__fray?.state.phase===1);
const result = await page.evaluate(async()=>{
 const m=window.__fray;
 // Repeatable two-fighter idle/training scene, no box overlay.
 const times=[], calls=[], triangles=[];
 let before=performance.now();
 for(let i=0;i<90;i++) {
  await new Promise(requestAnimationFrame);
  const now=performance.now();
  if(i>=15){times.push(now-before);calls.push(m.renderer.renderer.info.render.calls);triangles.push(m.renderer.renderer.info.render.triangles);}
  before=now;
 }
 times.sort((a,b)=>a-b);
 return {frames:times.length,msMedian:times[Math.floor(times.length*.5)],msP95:times[Math.floor(times.length*.95)],fps:1000/(times.reduce((a,b)=>a+b,0)/times.length),drawCalls:[Math.min(...calls),Math.max(...calls)],triangles:[Math.min(...triangles),Math.max(...triangles)],pixelRatio:m.renderer.renderer.getPixelRatio(),renderer:m.renderer.renderer.getContext().getParameter(m.renderer.renderer.getContext().RENDERER)};
});
console.log(JSON.stringify(result));
if(process.argv[3])await page.screenshot({path:process.argv[3]});
await browser.close();
