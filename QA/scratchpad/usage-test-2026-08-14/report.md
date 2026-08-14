# 30-Minute Usage Test Report

## 1. Run metadata
- Start: 2026-08-14T07:02:38.158Z
- Duration target: 30 min
- Git commit: ed52253
- AI model: local Ollama qwen3:8b

## 2. Pass/fail summary
| Check | Result |
|---|---|
| Console errors | WARN (13) |
| Page errors | PASS |
| WS disconnects | PASS |
| TV connectivity | PASS (100.0%) |
| Showcase screens created | 3/3 expected |
| AI turns completed | 6/6 expected |
| Price changes applied | 3/3 expected |

## 3. CPU / Memory
**vite**: CPU avg 0.1% (max 1.4%), RSS avg 75MB (max 149MB)
  - t=5min vs t=25min RSS: 110MB -> 61MB
**server**: CPU avg 0.6% (max 10.3%), RSS avg 194MB (max 401MB)
  - t=5min vs t=25min RSS: 262MB -> 174MB
**chrome**: CPU avg 38.0% (max 112.1%), RSS avg 1875MB (max 3053MB)
  - t=5min vs t=25min RSS: 1798MB -> 1969MB
- Idle baseline samples: 3 (see metrics.jsonl, phase=idle-baseline)

## 4. Disk
- t=320s: 700K	/Users/yngve/Desktop/GitHub/wraps-coffee/server/data;  46M	/Users/yngve/Desktop/GitHub/wraps-coffee/server/uploads; 1.8M	/Users/yngve/Desktop/GitHub/wraps-coffee/server/news-image-cache
- t=621s: 700K	/Users/yngve/Desktop/GitHub/wraps-coffee/server/data;  46M	/Users/yngve/Desktop/GitHub/wraps-coffee/server/uploads; 2.4M	/Users/yngve/Desktop/GitHub/wraps-coffee/server/news-image-cache
- t=922s: 700K	/Users/yngve/Desktop/GitHub/wraps-coffee/server/data;  46M	/Users/yngve/Desktop/GitHub/wraps-coffee/server/uploads; 2.6M	/Users/yngve/Desktop/GitHub/wraps-coffee/server/news-image-cache
- t=1223s: 700K	/Users/yngve/Desktop/GitHub/wraps-coffee/server/data;  46M	/Users/yngve/Desktop/GitHub/wraps-coffee/server/uploads; 2.8M	/Users/yngve/Desktop/GitHub/wraps-coffee/server/news-image-cache
- t=1525s: 700K	/Users/yngve/Desktop/GitHub/wraps-coffee/server/data;  46M	/Users/yngve/Desktop/GitHub/wraps-coffee/server/uploads; 3.2M	/Users/yngve/Desktop/GitHub/wraps-coffee/server/news-image-cache

## 5. Reliability detail
- Console errors: 13
- Page errors: 0
- WS disconnect events: 0
- TV connection transitions: 1

## 6. Activity log
- Display switches: 60
- AI turns: 6
  - [read-only] "Hvor mange skjermer har vi registrert nå?..." — 19363ms — replied
  - [read-only] "List opp kategoriene i katalogen 'Diagnostikk (as-is)'...." — 39148ms — replied
  - [read-only] "Hva er værmeldingen for i dag?..." — 6783ms — replied
  - [read-only] "Når er neste avgang fra Ulven torg?..." — 12341ms — replied
  - [read-only] "Oppsummer hva som skjer på meldingstavlen 'General'...." — 18939ms — replied
  - [write-flow] "Legg til et nytt produkt kalt 'Diagnostikk Ekstra' i kategor..." — 16401ms — gate-cancelled
- Price changes: 3
- Showcase screens created: usage-test-panes-1, usage-test-panes-2, usage-test-panes-3

## 7. Cleanup verification
- price-revert: OK
- showcase-screen-3-kept: OK
- message-board-post-kept: OK
- video-upload-kept: OK
- browser-closed: OK
- browser-closed: OK
- browser-closed: OK

## 8. Known limitations
- Chromium CPU/RSS reported as one aggregate across all 3 windows, not per-tab.
- TV monitored via disk-poll of lastSeenAt, not native automation.
- Numbers include the cost of running 3 headed browsers + Ollama + preview server concurrently on this dev machine.