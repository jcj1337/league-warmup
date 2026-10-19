# Pause menu

`Esc` during a run opens a centred pause menu and freezes the whole simulation: the clock,
movement, cast windows, cooldowns and projectiles. It holds Resume, Restart Round and Return
to Select, the settings (Mouse Speed slider, Damage Numbers, Pause on Focus Loss) and every
rebindable key. Settings and bindings are saved in the browser.

## Sub-features

- `pause-open`: `Esc` pauses and shows the menu. `Esc` again (when no rebind is waiting) resumes.
- `pause-freeze`: game time does not advance while the menu is open, and nothing fast-forwards on resume.
- `pause-resume`, `pause-restart`, `pause-select`: the three buttons. Restart skips the start card; Return to Select brings it back held.
- `setting-cycle`: clicking `Damage Numbers` / `Pause on Focus Loss` toggles ON / OFF and saves it.
- `focus-loss`: with Pause on Focus Loss ON, losing window focus opens the menu.
- `rebind`: click a key row, press a key. The row, `__keybinds` and the ability bar all change, and the new key plays.
- `rebind-swap`: a key already in use swaps the two bindings, and the status line names the move.
- `rebind-cancel`: `Esc` while a row waits cancels the rebind, not the menu.
- `rebind-reset`: `RESET KEYS` restores the defaults.

## How to get to it (user POV)

- Press `Esc` during a run, when A-targeting is not armed.
- Alt-tab or click away while Pause on Focus Loss is ON.
- The start screen and end screen have no pause menu.

## Driving it with hd

Preconditions:

- `DOCTOR OK`. `await hd.open()`, then `await hd.startRun()`.
- Defaults from the empty profile: `pauseMenu().rows` is `{ 'Damage Numbers': 'ON', 'Pause on Focus Loss': 'ON' }`, and `pauseMenu().binds` is `{ abilityQ:'Q', abilityW:'W', abilityE:'E', abilityR:'R', flash:'F', attackMoveClick:'T', attackMove:'A', stop:'S', chatMode:'Z' }`.

- **Open.** `hd.press('Escape')`, then `hd.waitFor(() => window.__warmup.scene.getScene('UIScene').pauseMenu.visible)`. `game().paused` is true. Take `hd.shot('paused')`.
- **Freeze.** Read `game().clockMs`, `hd.wait(500)`, read again: equal. Cooldowns (`hud.abilityCooldowns.*.remaining`) are unchanged too.
- **Resume.** `hd.click(await hd.button('pause', 'RESUME'))`. The menu hides and `hd.waitGame(200)` succeeds. Pressing `Escape` twice gets the same result.
- **Restart Round.** Note `hud.round`, then `hd.click(await hd.button('pause', 'RESTART ROUND'))`. `hud.round` bumps, `awaiting` is false (no card), and the clock restarts near 0.
- **Return to Select.** `hd.click(await hd.button('pause', 'RETURN TO SELECT'), { hold: 120 })`. Expect `startScreen: true`, `awaiting: true`, `clockMs: 0` and `paused: false` after the release. The button acts on press, and the release landing on the card must not start the run.
- **Setting cycle.** With the menu open, `hd.click(await hd.settingRow('Damage Numbers'))`. `pauseMenu().rows['Damage Numbers'] === 'OFF'` and `read(() => window.__balance.DEBUG.showDamageNumbers) === false`. Then `hd.reload()`, `hd.startRun()`, `Escape`: the row still reads `OFF`.
- **Focus loss.** `hd.stage('window blur', () => window.dispatchEvent(new Event('blur')))`. The menu opens. Repeat after cycling `Pause on Focus Loss` to OFF: the run keeps playing.
- **Rebind.** `hd.click(await hd.bindRow('abilityQ'))`. `binds.abilityQ === 'PRESS A KEY'` and `status` contains `PRESS A KEY`. `hd.press('y')`: `binds.abilityQ === 'Y'`, `read(() => window.__keybinds.all().abilityQ) === 'KeyY'`, and `hd.abilityBar()[0] === 'Y'`. The menu stays open.
- **Swap.** `hd.click(await hd.bindRow('abilityW'))`, then `hd.press('e')`. `status === 'E MOVED TO W'`, `__keybinds.all()` has `abilityW: 'KeyE'` and `abilityE: 'KeyW'`.
- **Cancel.** `hd.click(await hd.bindRow('flash'))`, then `hd.press('Escape')`. `binds.flash === 'F'`, `status === ''`, and the menu is still visible.
- **New key plays.** Close with `Escape`, then `hd.move(900, 360)`. `hd.press('q')` leaves `hud.abilityCooldowns.q.remaining === 0`. `hd.press('y')` makes it `> 0`.
- **Reset.** Reopen the menu and `hd.click(await hd.button('pause', 'RESET KEYS'))`. `status === 'KEYS RESET TO DEFAULTS'` and `binds` are back to the defaults.

## Gotchas

- The menu appears a frame *after* `paused` flips and hides a frame after resume. Wait on `pauseMenu.visible`, never on `paused` alone.
- `hd.settingRow` returns the value text's centre, and the text changes width (ON → OFF). Locate it again before each click.
- `Esc` while A-targeting is armed cancels the targeting, not opens the menu. Make sure `hud.attackMovePending` is false first.
- **Mouse Speed is out of scope.** Any value other than 1.0 makes the game request a pointer lock, which the harness blocks so the real cursor is never grabbed. Don't drag the slider. If a journey does, the transcript notes the blocked request, and nothing about the lock is proven.
- Focus loss can only be simulated (`stage` a `blur` event). A real alt-tab can't happen headless, so report focus-loss as verified only through the synthetic event.
- Keys the browser owns (F5, F11, F12, the Windows key) are refused as bindings. Don't use them to test a successful rebind.
- `Return to Select` acts on the press. Use `{ hold: 120 }` so the release lands on the card, as a person's click would.
