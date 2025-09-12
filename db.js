const DB_NAME = "badmintonDB";
const DB_VERSION = 2; // bumped version so upgrade runs
let db;

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e=>{
      db = e.target.result;
      // Players
      if(!db.objectStoreNames.contains("players")){
        db.createObjectStore("players",{keyPath:"id"});
      }
      // Matches
      if(!db.objectStoreNames.contains("matches")){
        db.createObjectStore("matches",{keyPath:"mid", autoIncrement:true});
      }
      // Attendance → fixed to allow multiple players per date
      if(!db.objectStoreNames.contains("attendance")){
        db.createObjectStore("attendance",{keyPath:"id"}); 
        // id will be "playerId::date"
      }
    };
    req.onsuccess = ()=>{ db = req.result; resolve(db); };
    req.onerror = ()=>reject(req.error);
  });
}

function tx(store,mode="readonly"){ return db.transaction(store,mode).objectStore(store); }

async function getAll(store){
  return new Promise((res,rej)=>{
    const out=[]; const req = tx(store).openCursor();
    req.onsuccess = e=>{
      const c = e.target.result;
      if(c){ out.push(c.value); c.continue(); } else res(out);
    };
    req.onerror = ()=>rej(req.error);
  });
}

async function put(store,val){
  return new Promise((res,rej)=>{
    const req = tx(store,"readwrite").put(val);
    req.onsuccess=()=>res(val); req.onerror=()=>rej(req.error);
  });
}

async function del(store,key){
  return new Promise((res,rej)=>{
    const req = tx(store,"readwrite").delete(key);
    req.onsuccess=()=>res(); req.onerror=()=>rej(req.error);
  });
}

// ========= Cross-page sync =========
const channel = new BroadcastChannel("badminton_sync");
function broadcast(type, payload){
  channel.postMessage({type,payload});
}
