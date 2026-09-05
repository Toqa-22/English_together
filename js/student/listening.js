(async () => {
  const profile = await Auth.guard("student");
  if (!profile) return;
  StudentShared.applyYoungMode(profile);
  await StudentShared.renderListeningGrid(Utils.$("#listening-grid"), profile);
})();
