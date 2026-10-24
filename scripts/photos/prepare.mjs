import {readFile,access,mkdir,copyFile} from "node:fs/promises";
// Keep bulk binary derivatives out of Git. A fresh checkout must explicitly
// restore the approved assets before a reproducible static build.
let records=[];
try{records=JSON.parse(await readFile("data/photo-library/approved.json","utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}
await mkdir("public/library/images",{recursive:true});
for(const record of records)for(const file of Object.values(record.derivatives)) {
  try{await access(`public/library/images/${file}`);}catch{
    try{await copyFile(`.photo-library/assets/${file}`,`public/library/images/${file}`);}
    catch{throw new Error(`Approved asset ${record.id} is missing. Run npm run photos:restore, then npm run photos:publish before building. No incomplete image library will be shipped.`);}
  }
}
console.log(`Prepared ${records.length} approved photo derivative sets.`);
