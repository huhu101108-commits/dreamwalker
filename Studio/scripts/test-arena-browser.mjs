import assert from 'node:assert/strict';
import {execFile,spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
export async function testArenaBrowser(editor,guest,origin,otherOrigin) {
  await editor.goto(origin+'/?tool=rules');
  await editor.getByRole('button',{name:'전투 규칙 · Unity',exact:true}).click();
  await editor.getByRole('button',{name:'+ 전투 규칙',exact:true}).click();
  await editor.getByLabel('규칙 이름').fill('광산 친선전 결정타');
  await editor.getByLabel('효과량',{exact:true}).fill('9999');
  await editor.getByText('친선전 로비 · 터치 조작 디자인',{exact:true}).click();
  await editor.getByLabel('이 조작의 디자인을 직접 지정').check();
  await editor.getByLabel('친선전 표시 문구',{exact:true}).fill('설화 일격');
  await editor.getByLabel('친선전 바탕색').fill('#924563');
  await editor.getByLabel('친선전 패드 왼쪽').fill('68');
  await editor.getByLabel('친선전 패드 너비').fill('30');
  await editor.getByRole('button',{name:'패드 위치와 크기 반영'}).click();
  await editor.getByLabel('디자인할 친선전 조작').selectOption('code');
  await editor.getByLabel('이 조작의 디자인을 직접 지정').check();
  await editor.getByLabel('친선전 표시 문구',{exact:true}).fill('초대 코드');
  await editor.getByLabel('친선전 입력 안내').fill('초대장의 8자리');
  await editor.getByText('친선전 조작 프리셋',{exact:true}).click();
  const shelf=editor.locator('details[data-persist="preset-arena"]');
  await shelf.getByLabel('친선전 조작 프리셋 이름').fill('설산 친선전');
  await shelf.getByRole('button',{name:'새 프리셋 저장'}).click();
  await editor.locator('#save').click();
  await editor.waitForFunction(()=>document.querySelector('#note')?.textContent.includes('저장 완료'));
  await editor.getByRole('button',{name:'저장한 전투 규칙 게시'}).click();
  await editor.waitForFunction(()=>document.querySelector('#note')?.textContent.includes('규칙 게시 완료'));
  const host=await editor.context().browser().newPage();
  try {
    await Promise.all([host.goto(origin+'/arena'),guest.goto(otherOrigin+'/arena')]);
    for(const page of [host,guest]) {
      await page.locator('#enter').click();
      await page.locator('#create').waitFor();
      await page.getByRole('textbox',{name:'초대 코드'}).waitFor();
      assert.equal(await page.getByLabel('초대 코드').getAttribute('placeholder'),'초대장의 8자리');
    }
    await host.locator('#create').click();
    await host.waitForFunction(()=>document.querySelector('#roomTitle')?.textContent.includes('1P'));
    const code=(await host.locator('#roomTitle').textContent()).match(/방 ([A-Z0-9]{8})/)[1];
    await guest.locator('#code').fill(code);await guest.locator('#join').click();
    await guest.waitForFunction(()=>document.querySelector('#roomTitle')?.textContent.includes('2P'));
    await guest.reload();
    await guest.waitForFunction(()=>document.querySelector('#roomTitle')?.textContent.includes('2P'));
    await host.waitForFunction(()=>document.querySelector('#bars')?.children.length===2 && document.querySelector('#banner').textContent==='');
    const attack=host.getByRole('button',{name:'설화 일격',exact:true});
    assert.deepEqual(await attack.evaluate(node=>[node.style.left,node.style.width,getComputedStyle(node).backgroundColor]),['68%','30%','rgb(146, 69, 99)']);
    await attack.click();
    await host.getByText('승리',{exact:true}).waitFor();await guest.getByText('패배',{exact:true}).waitFor();
    await host.waitForFunction(()=>document.querySelector('#wallet')?.textContent.includes('10크레딧'));
    await host.locator('#sell').click();
    await host.getByRole('button',{name:'판매 취소',exact:true}).waitFor();
    await guest.locator('#refresh').click();await guest.getByRole('button',{name:'구매',exact:true}).waitFor();
    await host.getByRole('button',{name:'판매 취소',exact:true}).click();
    await host.getByText('등록된 휘장이 없어요.',{exact:true}).waitFor();
    assert.match(await host.locator('#wallet').textContent(),/휘장 1개/);
    console.log('PASS rule authoring, owner publish, two browsers join, guest reload/rejoin, custom touch pad KO, reward, listing and cancel');
    if (process.env.GITHUB_ACTIONS || spawnSync('dotnet',['--version']).status===0) {
      await host.locator('#leave').click(); await host.locator('#create').click();
      await host.getByText('상대에게 방 코드를 공유하세요.').waitFor();
      const newCode=(await host.locator('#roomTitle').textContent()).match(/방 ([A-Z0-9]{8})/)[1];
      const project=fileURLToPath(new URL('./native-check/StudioContract.csproj',import.meta.url));
      const result=await promisify(execFile)('dotnet',['run','--no-build','--project',project,'--',origin,newCode],{timeout:30000});
      assert(result.stdout.includes('PASS Unity wire DTOs')); console.log(result.stdout.trim());
      await host.getByText('패배',{exact:true}).waitFor();
    }
  } finally { await host.close(); }
}
