import assert from 'node:assert/strict';
export async function testArenaBrowser(editor,guest,origin,otherOrigin) {
  await editor.goto(origin+'/?tool=rules');
  await editor.getByRole('button',{name:'전투 규칙 · Unity',exact:true}).click();
  await editor.getByRole('button',{name:'+ 전투 규칙',exact:true}).click();
  await editor.getByLabel('규칙 이름').fill('광산 친선전 결정타');
  await editor.getByLabel('효과량',{exact:true}).fill('9999');
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
    }
    await host.locator('#create').click();
    await host.waitForFunction(()=>document.querySelector('#roomTitle')?.textContent.includes('1P'));
    const code=(await host.locator('#roomTitle').textContent()).match(/방 ([A-Z0-9]{8})/)[1];
    await guest.locator('#code').fill(code);await guest.locator('#join').click();
    await guest.waitForFunction(()=>document.querySelector('#roomTitle')?.textContent.includes('2P'));
    await guest.reload();
    await guest.waitForFunction(()=>document.querySelector('#roomTitle')?.textContent.includes('2P'));
    await host.waitForFunction(()=>document.querySelector('#bars')?.children.length===2 && document.querySelector('#banner').textContent==='');
    await host.keyboard.press('z');
    await host.getByText('승리',{exact:true}).waitFor();await guest.getByText('패배',{exact:true}).waitFor();
    await host.waitForFunction(()=>document.querySelector('#wallet')?.textContent.includes('10크레딧'));
    await host.locator('#sell').click();
    await host.getByRole('button',{name:'판매 취소',exact:true}).waitFor();
    await guest.locator('#refresh').click();await guest.getByRole('button',{name:'구매',exact:true}).waitFor();
    await host.getByRole('button',{name:'판매 취소',exact:true}).click();
    await host.getByText('등록된 휘장이 없어요.',{exact:true}).waitFor();
    assert.match(await host.locator('#wallet').textContent(),/휘장 1개/);
    console.log('PASS rule authoring, owner publish, two browsers join, guest reload/rejoin, actual keyboard KO, reward, listing and cancel');
  } finally { await host.close(); }
}
