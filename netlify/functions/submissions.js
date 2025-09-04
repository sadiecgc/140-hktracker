// netlify/functions/submissions.js (SINGLE-COLUMN, CommonJS)
const { google } = require("googleapis");
const CORS = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const respond=(s,d)=>({statusCode:s,headers:{"Content-Type":"application/json",...CORS},body:JSON.stringify(d)});
exports.handler = async (event)=>{
  if(event.httpMethod==="OPTIONS") return {statusCode:204,headers:CORS,body:""};
  try{
    const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key=(process.env.GOOGLE_PRIVATE_KEY||"").replace(/\\n/g,"\n");
    const sheet=process.env.GOOGLE_SHEETS_ID;
    if(!email||!key||!sheet) return respond(500,{error:"Missing env vars"});
    const auth=new (require("googleapis").google.auth.JWT)(email,null,key,["https://www.googleapis.com/auth/spreadsheets"]);
    const sheets=require("googleapis").google.sheets({version:"v4",auth});
    if(event.httpMethod==="GET"){
      const r=await sheets.spreadsheets.values.get({spreadsheetId:sheet,range:"A2:A"});
      const submissions=(r.data.values||[]).map(v=>{try{return JSON.parse(v[0]??"")}catch{return {raw:v[0]??""}}});
      return respond(200,{submissions});
    }
    if(event.httpMethod==="POST"){
      const data=JSON.parse(event.body||"{}");
      if(typeof data.incompleteList==="string") data.incompleteList=data.incompleteList.split(/,\s*/).filter(Boolean);
      if(!Array.isArray(data.incompleteList)) data.incompleteList=[];
      if(!data.submittedAt) data.submittedAt=new Date().toISOString();
      await sheets.spreadsheets.values.append({spreadsheetId:sheet,range:"A:A",valueInputOption:"RAW",requestBody:{values:[[JSON.stringify(data)]]}});
      return respond(200,{ok:true});
    }
    return {statusCode:405,headers:CORS,body:"Method Not Allowed"};
  }catch(e){return respond(500,{error:e.message||"Unknown error"})}
};
