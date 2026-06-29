<script setup lang="ts">
const { theme: appTheme, accent: appAccent, density: appDensity, ligatures: appLigatures, showKbd: appShowKbd, vimNav: appVimNav } = useAppearance();

const accentColors = [
  { v: "#5b8dff", name: "Blue" },
  { v: "#b078ff", name: "Violet" },
  { v: "#52d39c", name: "Green" },
  { v: "#f5b94a", name: "Amber" },
];
</script>

<template>
  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Theme</div>
      <div class="set-section-sub">Colors used across the app. Auto follows your OS preference.</div>
    </div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Mode</div></div>
        <div class="set-row-control">
          <div class="segmented">
            <button :class="{ active: appTheme === 'dark' }"  @click="appTheme = 'dark'">Dark</button>
            <button :class="{ active: appTheme === 'light' }" @click="appTheme = 'light'">Light</button>
            <button :class="{ active: appTheme === 'auto' }"  @click="appTheme = 'auto'">Auto</button>
          </div>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Accent color</div>
          <div class="set-row-hint">Used for selection, focus rings, and primary actions.</div>
        </div>
        <div class="set-row-control">
          <div class="accent-pick">
            <button
              v-for="c in accentColors" :key="c.v"
              class="swatch" :class="{ on: appAccent === c.v }"
              :style="{ background: c.v }"
              :title="c.name"
              @click="appAccent = c.v"
            />
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Density</div>
      <div class="set-section-sub">How much breathing room between rows.</div>
    </div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Layout density</div></div>
        <div class="set-row-control">
          <div class="segmented">
            <button :class="{ active: appDensity === 'compact' }" @click="appDensity = 'compact'">Compact</button>
            <button :class="{ active: appDensity === 'dense' }"   @click="appDensity = 'dense'">Dense</button>
            <button :class="{ active: appDensity === 'loose' }"   @click="appDensity = 'loose'">Loose</button>
          </div>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Mono ligatures</div>
          <div class="set-row-hint">Render →, ==>, !=, etc. as glyphs in code blocks.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: appLigatures }" role="switch" @click="appLigatures = !appLigatures"><span class="thumb" /></button>
        </div>
      </div>
    </div>
  </section>

  <section class="set-section">
    <div class="set-section-head"><div><div class="set-section-title">Keyboard</div></div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Show shortcuts in tooltips</div></div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: appShowKbd }" role="switch" @click="appShowKbd = !appShowKbd"><span class="thumb" /></button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Vim-style nav (j/k)</div>
          <div class="set-row-hint">Move row-by-row in trace lists.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: appVimNav }" role="switch" @click="appVimNav = !appVimNav"><span class="thumb" /></button>
        </div>
      </div>
    </div>
  </section>
</template>
