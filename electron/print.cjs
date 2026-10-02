// Print preview / printing, the same as in SwiSS and Tax-E so the apps behave alike.
//
// printToPDF()/print() run against the live main window. Each page's own print
// CSS decides what is shown, so the preview is exactly what the printer receives.
const {app,ipcMain}=require('electron');
const path=require('node:path');
const fs=require('node:fs');

const PRINT_PREVIEW_DIR=path.join(app.getPath('temp'),'IECES-Admin-Portal-print-preview');

function cleanupPrintPreviewDir(){
 try{if(fs.existsSync(PRINT_PREVIEW_DIR))fs.rmSync(PRINT_PREVIEW_DIR,{recursive:true,force:true});}
 catch{/* Best-effort cleanup only — a leftover temp PDF is not worth surfacing an error for. */}
}

// Real physical page sizes (mm) for the paper choices offered. Used only for
// the "Fit to page" scale factor. Documents are authored for A4 unless
// they declare another paper (settings.documentPaper).
const PAGE_SIZE_MM={
 A4:{width:210,height:297},
 Letter:{width:215.9,height:279.4},
 Legal:{width:215.9,height:355.6},
 // Philippine folio / long bond, 8.5 x 13 in — not a named paper in Electron.
 Folio:{width:215.9,height:330.2},
};

function scaleFactorFor(settings){
 if(settings?.scaleMode==='custom'){
  const percent=Number(settings.scalePercent);
  return Number.isFinite(percent)&&percent>0?percent/100:1;
 }
 if(settings?.scaleMode==='fit'){
  const target=PAGE_SIZE_MM[settings.paperSize]||PAGE_SIZE_MM.A4;
  const landscape=settings.orientation==='landscape';
  const targetWidth=landscape?target.height:target.width, targetHeight=landscape?target.width:target.height;
  const native=PAGE_SIZE_MM[settings.documentPaper]||PAGE_SIZE_MM.A4;
  const nativeWidth=landscape?native.height:native.width, nativeHeight=landscape?native.width:native.height;
  return Math.min(targetWidth/nativeWidth,targetHeight/nativeHeight);
 }
 return 1;
}

// printToPDF()'s margins are inches; webContents.print()'s are a marginType
// enum plus custom values in microns (1 inch = 25400 microns).
function marginsInchesFor(preset,custom){
 switch(preset){
  case 'none':
  case 'match':return {top:0,bottom:0,left:0,right:0};
  case 'narrow':return {top:0.25,bottom:0.25,left:0.25,right:0.25};
  case 'custom':return {top:Number(custom?.top)||0,bottom:Number(custom?.bottom)||0,left:Number(custom?.left)||0,right:Number(custom?.right)||0};
  case 'normal':
  default:return {top:1,bottom:1,left:1,right:1};
 }
}
function marginTypeForPrint(preset,custom){
 if(preset==='match'||preset==='none')return {marginType:'none'};
 const inches=marginsInchesFor(preset,custom);
 return {marginType:'custom',top:Math.round(inches.top*25400),bottom:Math.round(inches.bottom*25400),left:Math.round(inches.left*25400),right:Math.round(inches.right*25400)};
}

// Accepts "1", "1-3", "1,3,5", "1-3,5,8" — 1-based, inclusive. Throws with a
// user-readable message on anything else, including an out-of-range page.
function parsePageRanges(rangeString,totalPages){
 const trimmed=String(rangeString||'').trim();
 if(!trimmed)throw new Error('Enter a page range, e.g. 1-3 or 1,3,5.');
 const parts=trimmed.split(',').map(part=>part.trim()).filter(Boolean);
 if(!parts.length)throw new Error('Enter a page range, e.g. 1-3 or 1,3,5.');
 const ranges=[];
 for(const part of parts){
  const match=part.match(/^(\d+)(?:-(\d+))?$/);
  if(!match)throw new Error(`"${part}" is not a valid page or range.`);
  const from=parseInt(match[1],10), to=match[2]?parseInt(match[2],10):from;
  if(from<1||to<from)throw new Error(`"${part}" is not a valid page or range.`);
  if(totalPages&&from>totalPages)throw new Error(`Page ${from} is past the last page (${totalPages}).`);
  ranges.push([from,Math.min(to,totalPages||to)]);
 }
 return ranges;
}
const pageRangesToPdfString=ranges=>ranges.map(([from,to])=>(from===to?`${from}`:`${from}-${to}`)).join(',');
// webContents.print()'s pageRanges are 0-based {from,to}, inclusive.
const pageRangesToPrintArray=ranges=>ranges.map(([from,to])=>({from:from-1,to:to-1}));

function resolveEffectivePageRanges(settings){
 if(settings.pageRange==='current'){const page=Math.max(1,Number(settings.currentPage)||1);return [[page,page]];}
 if(settings.pageRange==='custom')return parsePageRanges(settings.pageRangeCustom,Number(settings.totalPages)||0);
 return null; // "all"
}

// Electron takes named papers as strings but Folio as an explicit size:
// inches for printToPDF, microns for webContents.print.
const electronPdfPageSize=name=>name==='Folio'?{width:8.5,height:13}:name;
const electronPrintPageSize=name=>name==='Folio'?{width:215900,height:330200}:name;

const documentPaperOf=settings=>PAGE_SIZE_MM[settings?.documentPaper]?settings.documentPaper:'A4';

function buildPdfOptions(settings){
 const matchesDocument=!settings.paperSize||settings.paperSize==='match';
 const marginsMatchDocument=!settings.margins||settings.margins==='match';
 const usesDocumentOwnPageBox=matchesDocument&&marginsMatchDocument&&settings.scaleMode!=='fit';
 let pageRanges='';
 if(settings.pageRange&&settings.pageRange!=='all')pageRanges=pageRangesToPdfString(resolveEffectivePageRanges(settings));
 return {
  landscape:settings.orientation==='landscape',
  printBackground:true,
  preferCSSPageSize:usesDocumentOwnPageBox,
  scale:scaleFactorFor(settings),
  pageSize:matchesDocument?documentPaperOf(settings):settings.paperSize,
  margins:marginsInchesFor(marginsMatchDocument?'match':settings.margins,settings.customMargins),
  pageRanges,
 };
}

// Chromium answers "Printing failed" when the window is still busy with
// another print pass (a job just sent to a printer, a preview being
// replaced). That clears by itself, so the pass is tried again shortly.
const PDF_RETRIES=3, PDF_RETRY_MS=700;
async function printToPdfWithRetry(contents,options){
 for(let attempt=1;;attempt++){
  try{return await contents.printToPDF(options);}
  catch(error){
   if(attempt>=PDF_RETRIES||!/Printing failed/i.test(error.message||'')||contents.isDestroyed())throw error;
   await new Promise(resolve=>setTimeout(resolve,PDF_RETRY_MS));
  }
 }
}

function register(getWindow){
 ipcMain.handle('print:get-printers',async()=>{
  try{
   const printers=await getWindow().webContents.getPrintersAsync();
   return {success:true,printers:printers.map(printer=>({name:printer.name,displayName:printer.displayName||printer.name,isDefault:!!printer.isDefault,status:printer.status}))};
  }catch(error){return {success:false,error:error.message||'Could not list installed printers.'};}
 });

 // Report styles contain @page { size: A4 ...; margin: ... }, which Chromium
 // gives priority over printToPDF's landscape/margin options. Apply explicit
 // preview choices only for this print pass, then restore the document.
 // Passes are serialized so a later request cannot replace an in-flight rule.
 let previewQueue=Promise.resolve();
 async function renderPrintPreview(settings={}){
  let pageStyleKey;
  const contents=getWindow().webContents;
  try{
   const options=buildPdfOptions(settings);
   const pageRules=[];
   if(settings.paperSize&&settings.paperSize!=='match'||options.landscape!==(settings.documentOrientation==='landscape')){
    if(!PAGE_SIZE_MM[options.pageSize])throw new Error('Unsupported preview paper size.');
    pageRules.push(options.pageSize==='Folio'
     ?`size: ${options.landscape?'13in 8.5in':'8.5in 13in'} !important`
     :`size: ${options.pageSize} ${options.landscape?'landscape':'portrait'} !important`);
   }
   if(settings.margins&&settings.margins!=='match'){
    const margins=options.margins;
    if(Object.values(margins).some(value=>!Number.isFinite(value)||value<0))throw new Error('Preview margins must be non-negative numbers.');
    pageRules.push(`margin: ${margins.top}in ${margins.right}in ${margins.bottom}in ${margins.left}in !important`);
   }
   if(pageRules.length)pageStyleKey=await contents.insertCSS(`@media print { @page { ${pageRules.join('; ')}; } }`);
   const buffer=await printToPdfWithRetry(contents,{...options,pageSize:electronPdfPageSize(options.pageSize)});
   if(!Buffer.isBuffer(buffer)||buffer.length<4||buffer.subarray(0,4).toString('ascii')!=='%PDF')throw new Error('Print preview generation returned invalid PDF data.');
   fs.mkdirSync(PRINT_PREVIEW_DIR,{recursive:true});
   for(const file of fs.readdirSync(PRINT_PREVIEW_DIR))fs.rmSync(path.join(PRINT_PREVIEW_DIR,file),{force:true});
   fs.writeFileSync(path.join(PRINT_PREVIEW_DIR,`preview-${Date.now()}.pdf`),buffer);
   return {success:true,base64:buffer.toString('base64')};
  }catch(error){
   console.error('Print preview generation failed:',error);
   return {success:false,error:/Printing failed/i.test(error.message||'')?'The preview could not be prepared because the window was still busy with another print. Wait for any print job just sent to finish, then close this preview and open it again; restart the app if it keeps happening.':error.message||'Could not generate a print preview.'};
  }finally{
   if(pageStyleKey&&!contents.isDestroyed())await contents.removeInsertedCSS(pageStyleKey);
  }
 }
 ipcMain.handle('print:render-preview',(_event,settings)=>{
  const pending=previewQueue.then(()=>renderPrintPreview(settings||{}));
  previewQueue=pending.catch(()=>{}); // Keep the queue usable after a failed IPC call.
  return pending;
 });

 ipcMain.handle('print:execute',async(_event,settings)=>{
  try{
   const contents=getWindow().webContents;
   const printers=await contents.getPrintersAsync();
   if(!printers.length)return {success:false,error:'No printers are installed on this computer.'};
   const chosen=settings?.printerName?printers.find(printer=>printer.name===settings.printerName):printers.find(printer=>printer.isDefault)||printers[0];
   if(!chosen)return {success:false,error:`Printer "${settings?.printerName}" is no longer available. Reopen Print Preview to refresh the printer list.`};
   let pageRanges;
   try{const ranges=resolveEffectivePageRanges(settings||{});pageRanges=ranges?pageRangesToPrintArray(ranges):undefined;}
   catch(error){return {success:false,error:error.message};}
   // Silent: the preview dialog already chose printer, copies and layout,
   // so Chromium's own print dialog is not shown a second time.
   const printOptions={
    silent:true,
    printBackground:true,
    deviceName:chosen.name,
    color:settings?.colorMode!=='grayscale',
    landscape:settings?.orientation==='landscape',
    pageSize:electronPrintPageSize((!settings?.paperSize||settings.paperSize==='match')?documentPaperOf(settings):settings.paperSize),
    scaleFactor:Math.round(scaleFactorFor(settings||{})*100),
    copies:Math.max(1,Number(settings?.copies)||1),
    collate:true,
    margins:marginTypeForPrint(settings?.margins,settings?.customMargins),
    ...(pageRanges?{pageRanges}:{}),
   };
   const result=await new Promise(resolve=>{contents.print(printOptions,(success,errorType)=>resolve({success,errorType}));});
   if(!result.success)return {success:false,error:result.errorType&&result.errorType!=='cancelled'?result.errorType:'Printing was canceled.'};
   return {success:true};
  }catch(error){return {success:false,error:error.message||'Printing failed.'};}
 });

 ipcMain.handle('print:cleanup-preview',()=>{cleanupPrintPreviewDir();return {success:true};});
}

module.exports={register,cleanupPrintPreviewDir};
