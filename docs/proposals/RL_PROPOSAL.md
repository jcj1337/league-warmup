# Benchmark Bot & RL Proposal

Status: **parked**, since game improvements come first. Written 2026-10-02 to keep the plan from our discussion for later.

## Summary

Add a benchmark bot that plays the same run alongside you in a parallel arena. You can watch it with **Alt+1**, the way League's F-keys let you watch a teammate. It starts as a **hand-written expert bot with human limitations**. Reinforcement learning (RL) comes later as an upgrade to the bot's brain; the feature doesn't depend on it.

Why: the fastest way to improve is to watch stronger play of the exact situation you just faced. The groundwork (a headless simulation and replays) is worth having even if RL never pans out.

## Player experience

You and the bot play the same run at the same time, each in your own copy of the arena: same stages, same waves, same timing. Your game keeps running while you watch the bot, so looking away has a cost, just like in League.

| Situation | Behaviour |
| --- | --- |
| Tap Alt+1 | Switch view to the bot; tap again to return |
| Hold Alt+1 | Peek at the bot; release to return |
| Move/attack click while spectating | Ignored: no new movement orders |
| Order already in progress | Keeps running; spectating never cancels it |
| Q / W / E / F while spectating | Still fire, aimed at the cursor position in *your* arena (blind cast) |
| You die | Your view greys out and switches to the bot, which plays on |
| End screen | Adds a "Watch replay" button (your run and the bot's) |

- Start with one bot on Alt+1. Alt+2 onward stay free for more bots, e.g. different skill levels.
- Show a "Spectating" banner, and flash a warning if you take damage while looking away.
- Block the browser default for a lone Alt press, which focuses the browser's menu bar on Windows.
- Later idea: a **Tab scoreboard** comparing you and the bot (clear time, damage taken, accuracy, APM, kiting stats from `KitingMetrics`).

## Architecture

The one big change is splitting the game into a **World** (state and rules, no drawing) and **Views** (drawing). Today `GameScene` is both, so only one copy of the game can exist.

- **World**: owns the player, enemies, all systems, the `GameClock` and a seeded RNG. It does no Phaser drawing, so any number of Worlds can exist, including headless in Node.
- **Views**: draw whichever World is being watched. Alt+1 just points the Views at the bot's World. The arena never scrolls, so switching is instant.
- **Sync**: both Worlds advance on the same frame with the same delta. Pause and restart apply to both.
- **Fair comparison**: both Worlds share a seed, with separate RNG streams for wave spawns, shot origins and aim jitter. Shots still aim at each player's own position, so the runs differ only by how each side played.

Already in place:

- `InputController` never changes the game directly. It turns input into commands through the `CommandHandler` interface (move, attack, attack-move, cast at a point). The bot sends the same commands, so every rule (windups, cooldowns, metrics) applies to it the same way.
- `GameClock` only advances on simulated frames, which is what a headless sim needs.
- Systems mostly use Phaser only for math helpers (`Clamp`, `Between`), which are easy to replace.

Needs work:

- Many systems/entities take a `Phaser.Scene` in their constructor, and some draw directly (e.g. `AttackSystem` creates its own target marker).
- Randomness comes from `Phaser.Math.Between` / `Math.random`. It must move to seeded streams.

## Replays

A replay is the run's seed plus a timestamped list of commands. Feeding them back into a fresh World reproduces the run exactly, so a replay is a few KB, not a video.

- Powers the "Watch replay" button for both your run and the bot's.
- Useful on its own: watch yourself back, share runs.
- Doubles as training data later.

## Scripted bot and human limitations

The first bot is hand-written. An RL bot often wins in strange, unreadable ways, and the point here is to watch good technique.

- **Orbwalking**: attack, then move during the cooldown, using `AttackSystem`'s exact windup timing.
- **Dodging**: enemy shots fly straight and never re-aim, so the bot computes which ones will hit and steps out of their path.
- **Aiming**: leads Q based on enemy movement.
- **Kiting**: keeps Pursuers at the edge of attack range.

**Human limitations apply to every version of the bot, scripted and RL.** They live in the harness around the bot, not in its brain or reward:

| Limit | Starting value |
| --- | --- |
| Reaction delay (sees the game late) | ~200 ms |
| Decision rate | ~5–8 decisions/sec |
| APM cap | Cap bursts, not just the average (AlphaStar's lesson) |
| Aim error | Small random offset on every aimed action |

The bot sits behind a `BotBrain` interface (game state in, commands out). The scripted brain, an RL brain, or a model trained on your replays can each be swapped in without touching spectating.

## RL approach (later)

The plan: the RL bot first **copies** the scripted bot, then **improves** through practice, with a penalty for drifting too far from the scripted style. AlphaStar used a similar trick with human games to keep its play human-like.

### What makes RL feasible here (in order of importance)

1. **Human limits built into the environment.** It's better to make weird behaviour impossible than to penalize it.
2. **High-level actions.** Choices like "move in direction 1–16, short or long", "attack enemy #2", "Q at enemy #1" (the game computes the lead and adds aim error), and "flash away from the nearest threat". That's a few dozen choices instead of raw mouse control. This is likely the difference between training overnight and never converging.
3. **Starting from the scripted bot** (imitation first, then RL).
4. **A simple reward.**

### Reward design

| Term | Purpose |
| --- | --- |
| + stage cleared (bigger for faster clears) | The actual goal |
| − death (large) | The actual goal |
| − damage taken | Dodging and positioning |
| + enemy health removed | Gives it feedback during a fight, not only at the end |
| − small cost per second | Kills the stalling exploit |

- **Don't reward accuracy, APM or kiting stats.** The bot will game them, e.g. by spamming actions or only taking safe shots. Track them as monitoring stats instead, along with time near walls and distance from centre.
- **Reward hacking is the main risk.** The agent maximizes the number you give it, not what you meant, and adding penalty terms just moves the loophole.
- **Our current score has exactly this problem.** `ScoreSystem` gives points per second alive, so an RL bot would learn to survive without killing anything and farm them.
- **Train on random seeds and stages** so it can't memorize a run. Use a curriculum: Stages 1–3 first.
- If the bot still ends up sitting in corners, corners may genuinely be the best spot in the game. That's a balance finding, and the fix belongs in the game, not the reward.

### Feasibility

- **Observation**: a fixed-size list of numbers (nearest enemies and projectiles, cooldowns, own state), not pixels. That means a small neural network, trained on a desktop CPU with no GPU.
- **Speed**: the headless World should run 10,000+ steps/sec per copy, with several copies in parallel.
- **Scale**: ~1–10M steps for early stages, more for Stage 10. That's hours to an overnight run per attempt, plus several rounds of tuning.
- **Tooling**: Python + Stable-Baselines3 (PPO) talking to the TypeScript sim over a pipe. Keep a single copy of the game rules.
- **In the browser**: the trained network is small enough for ~50 lines of hand-written matrix math, no library needed. Hosting stays static and free.
- **Extra effort on top of the scripted bot**: ~1–2 weeks, mostly tuning, which is the uncertain part.

## Roadmap

| Phase | Work | Useful on its own? |
| --- | --- | --- |
| 1. World/View split + seeded RNG | 3–5 days | Yes: much faster tests |
| 2. Command recording + replays | 1–2 days | Yes: watch/share runs |
| 3. Scripted bot + human-limits harness | 3–5 days | — |
| 4. Alt+1 spectating, banner, death/replay flow | 1–2 days | **Playable feature done** |
| 5. Tab scoreboard | ~1 day | |
| 6. RL: imitation of scripted bot → PPO fine-tune | 1–2 weeks | Only swap in once it beats the scripted bot on clear time and damage taken |

Phases 1–5 take roughly 2–3 weeks at a relaxed pace. Each phase is useful even if a later one stalls.

## Related idea, also parked: adaptive enemies

Enemies that learn your dodge habits. This is a prediction problem, not RL, and doesn't need the headless sim.

- **Hook**: `EnemyProjectileSystem.spawnOne()`, which currently aims at the player's position at fire time plus jitter.
- **Learn**: record your position and velocity when each shot fires and when it reaches you. Store the dodge relative to the shot ("40 px to the shot's left"), grouped by situation: moving/still, mid-attack, near a wall, shot direction.
- **Aim**: current position + your average dodge for this situation, scaled by how consistent you are. If you're a 50/50 dodger, shots aim straight at you, so the only counter is being unpredictable.
- **Fairness knobs** (`balance.ts`): share of shots that use the prediction, ramping by stage; a maximum lead distance; learning speed.
- **Feedback**: distinct look for predicted shots, plus an end-of-run habit report ("you dodged left 81% of the time").
- **Effort**: ~3–4 days for a first version. A small in-browser model (+2–3 days) and adaptive Pursuers (+2–3 days) can come after.

## Reading list

- DeepMind blog: *AlphaStar: Mastering the Real-Time Strategy Game StarCraft II* (Jan 2019)
- DeepMind blog: *AlphaStar: Grandmaster level in StarCraft II using multi-agent reinforcement learning* (Oct 2019)
- Vinyals et al., *Grandmaster level in StarCraft II using multi-agent reinforcement learning*, Nature (2019)
- Search "AlphaStar APM controversy" (why human limits need care)
- Berner et al., *Dota 2 with Large Scale Deep Reinforcement Learning* (2019, arXiv 1912.06680). Read the reward table in the appendix.
- DeepMind blog: *Specification gaming: the flip side of AI ingenuity* (2020)
- OpenAI blog: *Faulty Reward Functions in the Wild* (2016)
- Hugging Face Deep RL Course (free, uses Stable-Baselines3)
- Stable-Baselines3 docs: custom environments
