import { lazy } from 'react';

const RELOAD_FLAG = 'mgm-chunk-reload';

// React.lazy for route pages, so each screen's code downloads only when it's first opened.
// A browser tab left open across a deploy can ask for a file that no longer exists
// (file names change every build) — reload once to pick up the new version instead of
// showing an error. The flag stops a reload loop if the file is genuinely missing.
export const lazyPage = (load) => lazy(() => load()
  .then((module) => {
    try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
    return module;
  })
  .catch((err) => {
    let reloaded = false;
    try { reloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { /* ignore */ }
    if (!reloaded) {
      try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* ignore */ }
      window.location.reload();
      return new Promise(() => {}); // wait for the reload
    }
    throw err;
  }));
