// Earlier flows in the shared browser run may save a team project that opens with a title, character select, an
// opening dialogue or screens that open by themselves. A flow that tests the field HUD clears these in its own unsaved
// draft or QA copy, so the game starts in the field.
export function startInField(page) {
  return page.evaluate(() => edit(() => {
    delete project.frontScreens;
    activeMap().entryStory = '';
    for (const l of project.layouts) l.rules = [];
  }));
}
