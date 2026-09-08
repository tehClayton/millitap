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

  return {
    all: read,

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
