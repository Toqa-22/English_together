(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;
  StudentShared.applyYoungMode(profile);
  await StudentShared.renderStoryGrid(Utils.$("#story-grid"), profile);
})();
