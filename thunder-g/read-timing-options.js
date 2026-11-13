{
  const timing = document.getElementById('read-timing');
  const status = document.getElementById('read-timing-status');
  let saved;
  async function load() {
    try {
      saved = await browser.inlineLabels.readTiming();
      if (![0, 1, 3, 20, -1].includes(saved)) {
        const option = document.createElement('option');
        option.value = String(saved); option.textContent = `After ${saved} seconds (current Thunderbird setting)`;
        timing.append(option);
      }
      timing.value = String(saved); timing.disabled = false;
    } catch (error) { status.textContent = error.message; }
  }
  timing.addEventListener('change', async () => {
    timing.disabled = true;
    try { saved = await browser.inlineLabels.readTiming(Number(timing.value)); status.textContent = ''; }
    catch (error) { timing.value = String(saved); status.textContent = error.message; }
    finally { timing.disabled = false; }
  });
  load();
}
