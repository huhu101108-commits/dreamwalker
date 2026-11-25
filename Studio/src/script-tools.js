// 대본으로 쓰기: writers paste a script and get dialogue lines; a dialogue goes out as a script or a voice recording CSV.
//   이름: 대사            the character with that name speaks (other names become a display name over narration)
//   이름(표정): 대사      with that expression of the character
//   대사                  narration
//   * 선택지              a choice on the line above; every choice leads to the line after the choices
//   // 메모               ignored
function parseScript(doc, text) {
  const nodes = [], problems = [];
  const people = new Map(doc.characters.map((c) => [c.name, c]));
  let dropped = 0;
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim(), at = i + 1;
    if (!line || line.startsWith('//')) return;
    const choice = /^[*-]\s*(.+)$/.exec(line);
    if (choice) {
      const last = nodes.at(-1);
      if (!last) { problems.push(at + '행 · 선택지 앞에 대사가 없어요.'); return; }
      if (last.choices.length >= LIMIT.choices) { problems.push(at + '행 · 한 줄의 선택지는 ' + LIMIT.choices + '개까지예요.'); return; }
      last.choices.push({ label: choice[1].slice(0, 80), to: '' });
      return;
    }
    if (nodes.length >= LIMIT.nodes) { if (!dropped++) problems.push(at + '행부터 · 한 대화는 ' + LIMIT.nodes + '줄까지라 뺐어요.'); return; }
    const node = newNode(uid());
    const spoken = /^([^:：()（）]{1,20})\s*(?:[(（]([^)）]{1,30})[)）])?\s*[:：]\s*(.*)$/.exec(line);
    if (spoken) {
      const name = spoken[1].trim(), mood = spoken[2]?.trim(), person = people.get(name);
      node.text = spoken[3];
      if (person) {
        node.speaker = person.id;
        if (mood) {
          const face = (person.expressions || []).find((x) => x.name === mood);
          if (face) node.expression = face.id;
          else problems.push(at + '행 · ' + name + '에게 «' + mood + '» 표정이 없어 기본 초상으로 둬요.');
        }
      } else if (name !== '내레이션') node.speakerName = name.slice(0, 50);
    } else node.text = line;
    if (node.text.length > 1200) { problems.push(at + '행 · 대사는 1200자까지라 잘랐어요.'); node.text = node.text.slice(0, 1200); }
    nodes.push(node);
  });
  // Every choice leads to the line after it; on the last line it ends the dialogue.
  nodes.forEach((n, i) => { for (const c of n.choices) c.to = nodes[i + 1]?.id || ''; });
  return { nodes, problems };
}
function scriptOf(doc, story) {
  return story.nodes.map((n) => {
    const person = named(doc.characters, n.speaker), face = person?.expressions?.find((x) => x.id === n.expression)?.name;
    // Narration that would read as a speaker, a choice or a note says so, so the script reads back the same.
    const plain = /^([^:：()（）]{1,20})\s*(?:[(（][^)）]{1,30}[)）])?\s*[:：]/.test(n.text) || /^([*-]|\/\/)/.test(n.text.trim());
    const who = person ? person.name + (face ? '(' + face + ')' : '') : n.speakerName || (plain ? '내레이션' : '');
    return (who ? who + ': ' : '') + n.text + n.choices.map((c) => '\n* ' + c.label).join('');
  }).join('\n') + '\n';
}
// For voice recording: one row per spoken line with its ID, speaker, expression and whether a voice file is attached.
function voiceScriptCsv(doc, story) {
  const rows = [['line', 'speaker', 'expression', 'text', 'voice'].map(csvCell).join(',')];
  for (const n of story.nodes) {
    const person = named(doc.characters, n.speaker);
    if (!person && !n.speakerName) continue;
    rows.push([n.id, person?.name || n.speakerName, person?.expressions?.find((x) => x.id === n.expression)?.name || '', n.text, n.voice ? '있음' : ''].map(csvCell).join(','));
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}
function scriptPanel(story) {
  const d = el('details');
  d.dataset.persist = 'story-script';
  d.append(el('summary', '대본으로 쓰기 · 내보내기'));
  const area = el('textarea');
  area.rows = 8;
  area.setAttribute('aria-label', '대본');
  area.placeholder = '백설: 여기가 설산 광산역이야.\n백설(웃음): 따라와.\n바람이 분다.\n* 따라간다\n* 돌아간다';
  const report = el('output');
  report.setAttribute('aria-live', 'polite');
  const read = () => {
    const r = parseScript(project, area.value);
    if (!r.nodes.length) throw Error('대본에 대사가 없어요.');
    return r;
  };
  // The tab redraws after a change, so the result also goes to the status line.
  const tell = (r, done) => {
    report.textContent = done + (r.problems.length ? ' · ' + r.problems.slice(0, 4).join(' · ') + (r.problems.length > 4 ? ' 외 ' + (r.problems.length - 4) + '건' : '') : '');
    note(report.textContent);
  };
  d.append(el('p', '«이름: 대사», «이름(표정): 대사», 이름 없는 줄은 내레이션, «* 선택지»는 위 줄의 선택지예요. 선택지는 모두 다음 줄로 이어지니 연결은 아래에서 고치세요.'),
    area,
    row(action('새 대화로 만들기', () => {
      const r = read();
      if (project.stories.length >= LIMIT.stories) throw Error('대화는 ' + LIMIT.stories + '개까지예요.');
      const s = { ...newStory(uid(), '대본 ' + (project.stories.length + 1)), nodes: r.nodes };
      edit(() => project.stories.push(s));
      storyId = s.id;
      lineId = '';
      draw();
      tell(r, r.nodes.length + '줄로 «' + s.name + '»을 만들었어요');
    }, 'accent'),
    ...(story ? [action('이 대화 끝에 이어 붙이기', () => {
      const r = read();
      if (story.nodes.length + r.nodes.length > LIMIT.nodes) throw Error('한 대화는 ' + LIMIT.nodes + '줄까지예요.');
      edit(() => story.nodes.push(...r.nodes));
      tell(r, r.nodes.length + '줄을 이어 붙였어요');
    })] : [])),
    report,
    ...(story ? [row(action('이 대화를 대본으로', () => { area.value = scriptOf(project, story); report.textContent = story.nodes.length + '줄을 대본으로 바꿨어요.'; }, 'quiet'),
      action('음성 녹음 대본 CSV', () => saveLocaleCsv(voiceScriptCsv(project, story), story.name.replace(/[\\/:*?"<>|]/g, '_') + '-녹음.csv'), 'quiet'))] : []));
  return d;
}
