const STATE_LABEL = { ground: 'BODEN', air: 'LUFT', wallrun: 'WALLRUN', swing: 'SCHWINGEN', glide: 'GLEITEN', sprint: 'SPRINT', charge: 'AUFLADEN' };

// Dünne Schicht über dem DOM-HUD; schreibt nur, wenn sich Werte ändern.
export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      crosshair: $('crosshair'), dist: $('aimDist'), hookL: $('hookL'), hookR: $('hookR'),
      speed: $('speed'), alt: $('alt'), state: $('state'), gas: $('gasFill'), gasWrap: $('gasWrap'),
      vignette: $('vignette'), slowmo: $('slowmo'), charge: $('charge'),
    };
    this.cache = {};
  }

  set(key, value, apply) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    apply(value);
  }

  update(game) {
    const { player, aim, hooks } = game;
    const e = this.el;
    const speed = player.vel.length();
    this.set('speed', Math.round(speed * 3.6), (v) => (e.speed.textContent = v));
    this.set('alt', Math.max(0, Math.round(player.feetY)), (v) => (e.alt.textContent = `${v} m Höhe`));
    const swinging = hooks.some((h) => h.state === 'attached');
    let st = player.state;
    if (st === 'air') st = player.gliding ? 'glide' : swinging ? 'swing' : 'air';
    else if (st === 'ground') st = player.charging ? 'charge' : player.sprinting ? 'sprint' : 'ground';
    this.set('charge', player.charging ? Math.round(player.charge * 40) : -1, (v) => {
      e.charge.classList.toggle('hidden', v < 0);
      e.charge.classList.toggle('full', v >= 40);
      e.charge.style.setProperty('--p', `${Math.max(0, v) * 2.5}%`);
    });
    this.set('state', st, (v) => {
      e.state.textContent = STATE_LABEL[v];
      e.state.className = v;
    });
    const gasPct = Math.round((player.gas / game.config.gas.max) * 100);
    this.set('gas', gasPct, (v) => {
      e.gas.style.width = `${v}%`;
      e.gasWrap.classList.toggle('low', v < 20);
    });
    const ch = aim.hit ? (aim.inRange ? 'ok' : 'far') : 'none';
    this.set('ch', ch, (v) => (e.crosshair.className = v));
    this.set('dist', aim.hit ? Math.round(aim.distPlayer) : -1, (v) => (e.dist.textContent = v < 0 ? '' : `${v} m`));
    this.set('hookL', hooks[0].state, (v) => (e.hookL.className = `hook-ind left ${v}`));
    this.set('hookR', hooks[1].state, (v) => (e.hookR.className = `hook-ind right ${v}`));
    const vig = Math.min(1, Math.max(0, (speed - 25) / 45));
    this.set('vig', Math.round(vig * 50), (v) => (e.vignette.style.opacity = v / 50));
    this.set('slowmo', game.slowmo, (v) => e.slowmo.classList.toggle('hidden', !v));
  }
}
