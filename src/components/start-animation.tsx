/**
 * Start-Animation am Handy: drehendes Zoepp-Logo beim Öffnen der Cloud.
 * Reines HTML + Inline-Skript (läuft vor dem ersten Bild, kein Aufblitzen der Seite):
 * - nur am Handy (Touch + schmal) oder als installierte App (Standalone)
 * - einmal pro App-Öffnung (sessionStorage)
 * - „Bewegung reduzieren“ → nur kurzes Einblenden ohne Drehung
 * Das Skript setzt nur Klassen am <html>, das Overlay selbst bleibt unverändert (keine Hydration-Konflikte).
 */

const SKRIPT = `(function(){try{
var d=document.documentElement;
var app=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
var handy=window.matchMedia&&matchMedia('(pointer: coarse) and (max-width: 820px)').matches;
if(!app&&!handy)return;
try{if(sessionStorage.getItem('zm_start'))return;sessionStorage.setItem('zm_start','1');}catch(e){}
d.classList.add('zm-start');
setTimeout(function(){d.classList.add('zm-start-aus');},650);
setTimeout(function(){d.classList.remove('zm-start','zm-start-aus');},900);
}catch(e){}})();`;

export function StartAnimation() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SKRIPT }} />
      <div id="zm-start" aria-hidden="true">
        <div className="zm-start-buehne">
          {/* eslint-disable-next-line @next/next/no-img-element -- muss vor dem Laden von next/image sichtbar sein */}
          <img src="/icons/z-marke.png" alt="" width={96} height={96} className="zm-start-logo" />
        </div>
        <span className="zm-start-name">ZOEPP</span>
      </div>
    </>
  );
}
