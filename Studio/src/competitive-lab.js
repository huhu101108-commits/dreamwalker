// Editor-only skill synchronization fixture. Friendly rooms and wallets use their own protocol.
function competitiveProfile(doc, selection) {
  if (!Array.isArray(selection?.seats) || selection.seats.length !== 2 || !Array.isArray(selection.rules) ||
      selection.rules.length > 12 || new Set(selection.rules).size !== selection.rules.length)
    throw Error('두 좌석과 검수할 온라인 규칙을 12개 이내로 선택하세요.');
  const onlineRules = (doc.combatRules || []).filter(rule => rule.enabled && rule.appliesTo !== 'field');
  const rules = selection.rules.map(id => {
    const rule = named(onlineRules, id);
    if (!rule) throw Error('규칙의 사용 여부와 온라인 적용 범위를 확인하세요.');
    return structuredClone(rule);
  });
  const seats = selection.seats.map(choice => {
    const actor = named(doc.characters, choice?.actor), skill = actor?.skills[choice?.slot];
    if (!actor || !skill || !integer(choice.slot, 0, 11) || !['damage', 'heal', 'shield'].includes(choice.effect) ||
        !integer(choice.cooldown, -1, 7200) || !integer(choice.cap, 1, 9999) ||
        !integer(choice.start, 0, choice.cap) || !integer(choice.cost, 0, choice.cap) ||
        !integer(choice.regen, 0, choice.cap)) throw Error('캐릭터와 스킬 슬롯, 재사용 시간과 좌석별 자원 범위를 확인하세요.');
    return {
      actor: actor.id, hp: actor.health, slot: choice.slot, name: skill.name, effect: choice.effect,
      power: Math.max(1, Math.round(doc.tuning.damage * skill.power * actor.attackScale)),
      cooldown: choice.cooldown === -1 ? Math.round(skillCooldown(skill, doc.tuning) * 60) : choice.cooldown,
      cap: choice.cap, start: choice.start, cost: choice.cost, regen: choice.regen,
    };
  });
  return {version: 1, hz: 60, seats, rules};
}
function competitiveState(profile) {
  return {tick: 0, frame: 0, players: profile.seats.map(s => ({
    hp: s.hp, energy: s.start, ready: 0, ack: 0, casts: 0, hits: 0,
    cooldownBlocks: 0, resourceBlocks: 0, downBlocks: 0, memory: combatMemory(),
  }))};
}
const competitiveTick = ms => Math.floor(ms * 60 / 1000);
function competitiveAdvance(profile, state, tick) {
  if (tick <= state.tick) return;
  const steps = Math.floor(tick / 60) - Math.floor(state.tick / 60);
  state.players.forEach((p, i) => {
    p.energy = Math.min(profile.seats[i].cap, p.energy + steps * profile.seats[i].regen);
  });
  state.tick = tick;
}
function competitiveCommand(profile, state, seat, seq) {
  const self = state.players[seat], target = state.players[1-seat], spec = profile.seats[seat];
  if (seq <= self.ack) return 'duplicate';
  if (seq !== self.ack + 1) throw Error('앞선 입력의 승인 번호가 누락됐어요.');
  self.ack = seq;
  if (!self.hp || !target.hp) { self.downBlocks++; return 'down'; }
  if (state.tick < self.ready) { self.cooldownBlocks++; return 'cooldown'; }
  if (self.energy < spec.cost) { self.resourceBlocks++; return 'resource'; }
  self.energy -= spec.cost;
  self.ready = state.tick + spec.cooldown;
  self.casts++;
  if (spec.effect === 'heal') self.hp = Math.min(spec.hp, self.hp + spec.power);
  else if (spec.effect === 'shield') self.memory.shield = Math.min(9999, self.memory.shield + spec.power);
  else {
    function applyRule(i, event) {
      const p = state.players[i], actor = profile.seats[i];
      const delta = combatEvent(profile.rules, p.memory, event, actor.actor, state.tick, p.hp, actor.hp, 'arena');
      p.hp = Math.min(actor.hp, p.hp + delta.heal);
      return delta.damage;
    }
    self.hits++;
    const damage = absorbCombatDamage(target.memory, spec.power + applyRule(seat, 'hit'));
    target.hp = Math.max(0, target.hp - damage);
    applyRule(1-seat, 'hurt');
    if (!target.hp) applyRule(seat, 'kill');
  }
  return 'cast';
}
function competitiveInputs(inputs) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 32 ||
      inputs.some(c => !c || !integer(c.at, 0, 20000) || !integer(c.seat, 0, 1)))
    throw Error('두 좌석의 검수 입력을 20초 안에 1~32개 배치하세요.');
  const seq = [0, 0];
  return inputs.map(({at, seat}) => ({at, seat})).sort((a, b) => a.at - b.at)
    .map(c => ({...c, seq: ++seq[c.seat], axis: 0, press: 1}));
}
// This clock belongs to the repeatable server fixture. The editor supplies keypress times and fault controls.
function competitiveRecording(profile, inputs, transport) {
  const commands = competitiveInputs(inputs), delivery = arenaDeliveryPlan(commands, transport);
  const initial = competitiveState(profile), state = structuredClone(initial), frames = [], deliveries = [[], []], log = [];
  let end = 0;
  for (const event of delivery.events) {
    const {at, seat, cmd, ackAt} = event;
    competitiveAdvance(profile, state, competitiveTick(at));
    state.frame++;
    if (event.resume) log.push({at, seat, seq: state.players[seat].ack, result: 'rejoin'});
    else log.push({at, seat, seq: cmd.seq, result: competitiveCommand(profile, state, seat, cmd.seq)});
    // Confirmed state is broadcast. A lost input acknowledgement forces the sender to retry.
    const frameIndex = frames.push(structuredClone(state)) - 1;
    end = Math.max(end, at, ackAt || 0, at + Math.ceil(transport.rtt / 2));
    for (const viewer of [0, 1]) {
      const receiveAt = event.resume ? at : (viewer === seat ? ackAt : at + Math.ceil(transport.rtt / 2));
      if (receiveAt === null || (viewer === 1 && receiveAt >= transport.outageAt &&
          receiveAt < transport.outageAt + transport.outageMs)) continue;
      deliveries[viewer].push({at: receiveAt, frameIndex});
    }
  }
  end = Math.max(end, commands.at(-1).at, transport.outageAt + transport.outageMs) + 1;
  competitiveAdvance(profile, state, competitiveTick(end));
  state.frame++;
  const finalIndex = frames.push(structuredClone(state)) - 1;
  for (const viewer of [0, 1]) deliveries[viewer].push({at: end, frameIndex: finalIndex});
  return {initial, frames, deliveries, final: state, stats: delivery.stats, log, end};
}
function competitiveSeat(recording, viewer) {
  if (!integer(viewer, 0, 1)) throw Error('검수 좌석을 확인하세요.');
  const frames = recording.deliveries[viewer].map(d => ({at: d.at, state: recording.frames[d.frameIndex]}));
  const {initial, final, stats, log, end} = recording;
  return {viewer, initial, frames, final, stats, log, end};
}
function competitiveClient(profile, inputs, authority) {
  const {viewer, initial, frames, end} = authority;
  const commands = competitiveInputs(inputs).filter(c => c.seat === viewer);
  const events = [...commands.map(cmd => ({at: cmd.at, cmd})), ...frames]
    .sort((a, b) => a.at - b.at || (a.cmd ? 0 : 1) - (b.cmd ? 0 : 1));
  let state = structuredClone(initial), pending = [], latestFrame = -1;
  const metrics = {predicted: 0, snapshots: 0, stale: 0, corrected: 0, replayed: 0, peakPending: 0,
    maxHp: 0, maxEnergy: 0, maxCooldown: 0, maxShield: 0};
  for (const event of events) {
    const now = competitiveTick(event.at);
    competitiveAdvance(profile, state, now);
    if (event.cmd) {
      pending.push(event.cmd);
      competitiveCommand(profile, state, viewer, event.cmd.seq);
      metrics.predicted++; metrics.peakPending = Math.max(metrics.peakPending, pending.length);
      continue;
    }
    if (event.state.frame <= latestFrame) { metrics.stale++; continue; }
    latestFrame = event.state.frame;
    metrics.snapshots++;
    const before = state.players;
    state = structuredClone(event.state);
    pending = pending.filter(c => c.seq > state.players[viewer].ack);
    for (const cmd of pending) {
      competitiveAdvance(profile, state, competitiveTick(cmd.at));
      competitiveCommand(profile, state, viewer, cmd.seq);
      metrics.replayed++;
    }
    competitiveAdvance(profile, state, now);
    if (JSON.stringify(before) !== JSON.stringify(state.players)) metrics.corrected++;
    for (const [i, p] of state.players.entries()) {
      metrics.maxHp = Math.max(metrics.maxHp, Math.abs(before[i].hp - p.hp));
      metrics.maxEnergy = Math.max(metrics.maxEnergy, Math.abs(before[i].energy - p.energy));
      metrics.maxCooldown = Math.max(metrics.maxCooldown, Math.abs(before[i].ready - p.ready));
      metrics.maxShield = Math.max(metrics.maxShield, Math.abs(before[i].memory.shield - p.memory.shield));
    }
  }
  competitiveAdvance(profile, state, competitiveTick(end));
  return {state, metrics, pending: pending.length,
    match: !pending.length && JSON.stringify(state) === JSON.stringify(authority.final)};
}
