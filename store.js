/* Session store, shared by the drill page and the history page so the record
   shape and the bucket key are defined exactly once.

   Sessions hold sufficient statistics (count, sum, sum of squares) per bar
   position rather than raw taps. That aggregates correctly across any grouping
   we invent later, and keeps a session near 400 bytes instead of tens of KB. */
"use strict";

const Store = (() => {
  const KEY = "millitap.sessions.v1";
  const MAX = 2000;

  /* Every accessor is wrapped. localStorage does not merely return null when a
     browser has storage blocked — it throws on access — and a history page that
     white-screens because of a privacy setting is worse than one showing zero
     sessions. */
  function read(){
    try {
      const raw = localStorage.getItem(KEY);
      const a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function write(a){
    try { localStorage.setItem(KEY, JSON.stringify(a)); return true; }
    catch (e) {
      /* Effectively always quota. Drop the oldest quarter and try once; if that
         still fails, give up quietly rather than interrupting a drill. */
      try {
        localStorage.setItem(KEY, JSON.stringify(a.slice(Math.ceil(a.length/4))));
        return true;
      } catch (e2) { return false; }
    }
  }

  /* Templates are a different kind of thing from sessions — authored, edited and
     deleted, rather than appended and never touched — so they get their own key
     and their own accessors rather than sharing a shape they do not fit. */
  const TKEY = "millitap.templates.v1";
  const AKEY = "millitap.activeTemplate.v1";

  function readT(){
    try {
      const raw = localStorage.getItem(TKEY);
      const a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function writeT(a){
    try { localStorage.setItem(TKEY, JSON.stringify(a)); return true; }
    catch (e) { return false; }
  }

  return {
    all: read,

    templates: readT,

    /* Upsert by id, so editing a template in place and creating one are the
       same call and a half-edited template can never fork into two. */
    putTemplate(t){
      const a = readT();
      const i = a.findIndex(x => x.id === t.id);
      if (i < 0) a.push(t); else a[i] = t;
      return writeT(a);
    },

    dropTemplate(id){
      return writeT(readT().filter(t => t.id !== id));
    },

    /* Which template the drill page is appending to. Kept in storage rather than
       passed in a URL, because the two pages are separate documents and a full
       navigation is the only thing that happens between them. */
    activeTemplate(){
      try { return localStorage.getItem(AKEY); } catch (e) { return null; }
    },
    setActiveTemplate(id){
      try { id ? localStorage.setItem(AKEY, id) : localStorage.removeItem(AKEY); }
      catch (e) {}
    },

    /* How long a step will actually take. Steps measured in bars need the tempo
       map to answer that, and a ramping step needs the same closed form the
       scheduler uses — an estimate that disagreed with what plays would be worse
       than no estimate at all. */
    stepSeconds(st){
      if (!st || !st.len) return 0;
      if (st.len.u === "sec") return st.len.n;
      const beats = st.len.n * (st.beats || 4);
      const r = st.ramp;
      if (!r || !r.on || !r.secs || r.to === st.bpm) return beats * 60 / st.bpm;
      const k  = (r.to - st.bpm) / (2 * r.secs);
      const BT = r.secs * (st.bpm + r.to) / 120;
      if (beats >= BT) return r.secs + (beats - BT) * 60 / r.to;
      return (-st.bpm + Math.sqrt(st.bpm*st.bpm + 240*k*beats)) / (2*k);
    },

    templateSeconds(t){
      return (t && t.steps || []).reduce((a, st) => a + Store.stepSeconds(st), 0);
    },

    /* One backup file carries everything, because "back up millitap" is the
       thing a person wants, not "back up two of its three kinds of data". */
    exportAll(){
      return { app:"millitap", schema:2, exported:new Date().toISOString(),
               sessions:read(), templates:readT() };
    },

    importAll(parsed){
      // A bare array is a schema-1 session export; accept it rather than refuse.
      const rows = Array.isArray(parsed) ? parsed
                 : (parsed && Array.isArray(parsed.sessions) ? parsed.sessions : null);
      const tpls = parsed && Array.isArray(parsed.templates) ? parsed.templates : [];
      if (!rows && !tpls.length) return null;

      const res = rows ? Store.addMany(rows) : { added:0, skipped:0, ok:true };

      /* Templates merge by id: incoming replaces a template of the same id
         rather than being skipped, so a backup taken after an edit actually
         carries the edit. Both counts are reported so it is never a silent
         overwrite. */
      let tAdded = 0, tReplaced = 0;
      if (tpls.length){
        const have = readT();
        for (const t of tpls){
          if (!t || !t.id || !Array.isArray(t.steps)) continue;
          const i = have.findIndex(x => x.id === t.id);
          if (i < 0){ have.push(t); tAdded++; } else { have[i] = t; tReplaced++; }
        }
        writeT(have);
      }
      return { sessions:res.added, skipped:res.skipped,
               templates:tAdded, replaced:tReplaced, ok:res.ok };
    },

    add(rec){
      const a = read();
      a.push(rec);
      if (a.length > MAX) a.splice(0, a.length - MAX);
      return write(a);
    },

    clear(){ try { localStorage.removeItem(KEY); } catch (e) {} },

    /* Import merges rather than replaces, and dedupes on timestamp+key, so
       restoring the same backup twice is a no-op instead of doubling every
       session. One read and one write for the whole file — add() per row would
       re-serialise the entire store on each one. */
    addMany(rows){
      const a = read();
      const seen = new Set(a.map(x => x.t + "|" + x.key));
      let added = 0, skipped = 0;
      for (const r of rows){
        if (!r || typeof r.t !== "number" || !r.key || !Array.isArray(r.c)){ skipped++; continue; }
        const id = r.t + "|" + r.key;
        if (seen.has(id)){ skipped++; continue; }
        seen.add(id); a.push(r); added++;
      }
      a.sort((x,y) => x.t - y.t);
      if (a.length > MAX) a.splice(0, a.length - MAX);
      return { added, skipped, ok: added ? write(a) : true };
    },

    /* Grouped by bucket, each bucket's rows oldest-first, buckets ordered by
       most recent activity so the one you just drilled is first. */
    buckets(){
      const m = new Map();
      for (const r of read()){
        if (!r || !r.key) continue;
        if (!m.has(r.key)) m.set(r.key, { key:r.key, label:r.label || r.key, rows:[] });
        m.get(r.key).rows.push(r);
      }
      const out = [...m.values()];
      for (const b of out) b.rows.sort((x,y) => x.t - y.t);
      out.sort((a,b) => b.rows[b.rows.length-1].t - a.rows[a.rows.length-1].t);
      return out;
    },

    /* mean and population sd recovered from the stored statistics. */
    stat(n, sum, sq){
      if (!n) return { n:0, mean:0, sd:0 };
      const mean = sum/n;
      return { n, mean, sd: Math.sqrt(Math.max(0, sq/n - mean*mean)) };
    },

    /* Tempo bands pooled across a bucket. Sessions recorded before tempo
       binning existed carry no bands, so their whole aggregate stands in as a
       single band at the tempo they were played at — which is exactly what it
       was, for a fixed-tempo drill. */
    poolTempo(rows){
      const m = new Map();
      for (const r of rows){
        const bands = (Array.isArray(r.tb) && r.tb.length)
          ? r.tb : [[r.bpm, r.n, r.sum, r.sq]];
        for (const b of bands){
          let e = m.get(b[0]);
          if (!e) m.set(b[0], e = {bpm:b[0], n:0, sum:0, sq:0});
          e.n += b[1]; e.sum += b[2]; e.sq += b[3];
        }
      }
      return [...m.values()]
        .map(e => { const s = Store.stat(e.n, e.sum, e.sq); s.bpm = e.bpm; return s; })
        .sort((a,b) => a.bpm - b.bpm);
    },

    /* Pool one position across every session in a bucket. */
    poolPos(rows, i){
      let n=0, sum=0, sq=0;
      for (const r of rows){
        const c = r.c && r.c[i];
        if (!c) continue;
        n += c[0]; sum += c[1]; sq += c[2];
      }
      return Store.stat(n, sum, sq);
    }
  };
})();
