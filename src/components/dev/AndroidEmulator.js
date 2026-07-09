import { html, useState, useEffect } from "../../lib.js";

const PHONE_W = 432; // frame outer width + side buttons space
const PHONE_H = 904; // frame outer height

export function AndroidEmulator({ children }) {
  const [active, setActive] = useState(() => window.innerWidth >= 900);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function update() {
      const wide = window.innerWidth >= 900;
      setActive(wide);
      if (wide) {
        const scaleH = (window.innerHeight - 64) / PHONE_H;
        const scaleW = (window.innerWidth - 80) / PHONE_W;
        setScale(Math.min(1, scaleH, scaleW));
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!active) return html`${children}`;

  return html`
    <div class="emu-bg">
      <div class="emu-wrap" style=${{ transform: `scale(${scale})`, transformOrigin: "center center" }}>
        <div class="emu-phone">
          <div class="emu-btn emu-vol-up"></div>
          <div class="emu-btn emu-vol-dn"></div>
          <div class="emu-btn emu-pwr"></div>
          <div class="emu-frame">
            <div class="emu-screen">
              <div class="emu-punch"></div>
              <div class="emu-content">
                ${children}
              </div>
              <div class="emu-navbar">
                <div class="emu-pill"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="emu-label">Android · Grand écran</div>
      </div>
    </div>
  `;
}
