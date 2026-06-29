<template>
  <section class="set-section">
    <div class="set-section-head">
      <div>
        <div class="set-section-title">Custom domain</div>
        <div class="set-section-sub">Serve LLM Lens on your own subdomain. Available on the team plan.</div>
      </div>
      <span class="cs-badge">coming soon</span>
    </div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Domain</div></div>
        <div class="set-row-control"><div class="field-input"><input type="text" placeholder="lens.llmlens.dev" class="mono" ></div></div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">DNS</div>
          <div class="set-row-hint">Add a <code class="mono">CNAME</code> record pointing to <code class="mono">cname.llmlens.dev</code>.</div>
        </div>
        <div class="set-row-control"><button class="s-btn" disabled>Verify DNS</button></div>
      </div>
    </div>
  </section>
</template>
