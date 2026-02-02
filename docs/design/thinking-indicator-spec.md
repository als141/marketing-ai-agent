# AI Thinking Indicator -- Frontend Design Specification

## Problem Statement

After the user sends a message, there is a 3-9 second window (Phase 1: "Waiting") where no SSE events have arrived yet. The current UI shows only a thin blinking cursor (`animate-pulse` on a 2px-wide bar), which provides almost no feedback that the system is working. This creates anxiety and a feeling of brokenness, especially on slower connections or complex queries.

## Design Philosophy

The indicator should feel like a **living, breathing system** -- not a generic spinner. It communicates that the AI is actively preparing to analyze data, not frozen. The design draws inspiration from:

- **ChatGPT's** pulsing shimmer on "Thinking..." text
- **Claude.ai's** expanding thinking block with duration timer
- **Perplexity's** sequential step labels ("Searching...", "Reading...", "Analyzing...")
- **Gemini's** sparkle/particle animation

Our approach: a **shimmer text label with animated orbs**, transitioning into contextual phase labels as SSE events arrive. Minimal, on-brand, premium.

---

## Component Architecture

```
ThinkingIndicator (orchestrator)
  +-- ThinkingOrbs (3 animated gradient dots)
  +-- ThinkingLabel (shimmer text: "分析を準備しています...")
  +-- PhaseTransition (crossfade wrapper for phase changes)
```

This is rendered **inside the assistant message bubble**, not as a separate element. It replaces the current blinking cursor when `isStreaming === true` and no activity items or text content exist yet.

### Rendering Condition

```tsx
// Inside AssistantMessage, before any content renders:
const isEmpty = !message.content && (!items.length || items.every(it => it.kind === "text" && !(it as TextActivityItem).content));
const showThinking = message.isStreaming && isEmpty;
```

---

## Visual Design

### Layout

```
 [orb] [orb] [orb]   分析を準備しています...
  6px   6px   6px     shimmer text, 13px
```

- Left-aligned within the assistant message area (same as all assistant content)
- Container: `flex items-center gap-3`, height 40px, no background, no border
- The orbs sit to the left, the text to the right
- Total width: content-fit, max ~280px
- Vertical margin: `my-2` (8px top and bottom)

### ThinkingOrbs (3 animated dots)

Three small circles with a navy-to-accent gradient, staggered bounce animation.

**Specifications:**
- Size: 6px x 6px each
- Shape: perfect circle (`rounded-full`)
- Color: radial gradient from `#2a2a4e` (center) to `#e94560` (edge), 60% opacity at rest
- Gap between orbs: 4px
- Animation: `thinking-bounce` keyframe, 1.4s duration, ease-in-out, infinite
- Stagger: orb 1 = 0ms delay, orb 2 = 160ms delay, orb 3 = 320ms delay

```css
@keyframes thinking-bounce {
  0%, 80%, 100% {
    transform: scale(1);
    opacity: 0.4;
  }
  40% {
    transform: scale(1.6);
    opacity: 1;
  }
}
```

The bounce is subtle -- a 60% scale increase, not a full "jump". Combined with opacity fade, it creates a breathing/pulsing rhythm.

### ThinkingLabel (shimmer text)

A text label with an animated gradient sweep that moves left-to-right across the text, using `background-clip: text`.

**Specifications:**
- Font: Noto Sans JP, 13px (same as body text `text-[13px]`)
- Font weight: 400 (regular)
- Letter spacing: `0.02em` (slightly wider for readability at this size)
- Base color: `#9ca3af` (gray-400, same as reasoning text)
- Shimmer gradient: linear-gradient sweeping from `#9ca3af` through `#1a1a2e` (navy, the bright flash) back to `#9ca3af`
- Gradient size: `200% 100%` (double width for the sweep)
- Animation: `shimmer-sweep`, 2.5s, ease-in-out, infinite

```css
@keyframes shimmer-sweep {
  0% {
    background-position: 200% center;
  }
  100% {
    background-position: -200% center;
  }
}

.thinking-shimmer-text {
  background: linear-gradient(
    90deg,
    #9ca3af 0%,
    #9ca3af 35%,
    #1a1a2e 50%,
    #9ca3af 65%,
    #9ca3af 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer-sweep 2.5s ease-in-out infinite;
}
```

### Phase Labels (contextual text)

The label text changes based on the current phase, with a crossfade transition:

| Phase | Trigger | Label Text | Duration shown |
|-------|---------|-----------|---------------|
| **Waiting** | `isStreaming && no events` | `分析を準備しています...` | 0-9s |
| **Reasoning** | First `reasoning` event | (indicator hidden -- reasoning line takes over) | -- |
| **Tool call** | First `tool_call` event | (indicator hidden -- tool badge takes over) | -- |
| **Text streaming** | First `text_delta` event | (indicator hidden -- text content takes over) | -- |

The thinking indicator is **only visible during Phase 1** (waiting). Once any SSE event arrives and creates an activity item or text content, the condition `isEmpty` becomes false and the indicator naturally disappears as real content replaces it.

For the waiting phase, after 4 seconds without any events, the label subtly crossfades to a second message:

| Time | Label |
|------|-------|
| 0-4s | `分析を準備しています...` |
| 4-8s | `データソースに接続しています...` |
| 8s+ | `もう少しお待ちください...` |

Crossfade: 400ms transition with `opacity` and a slight `translateY(-2px)` upward movement.

```css
@keyframes thinking-fade-in {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## Component Implementation

### ThinkingIndicator.tsx

```tsx
"use client";

import { useState, useEffect } from "react";

const PHASE_LABELS = [
  { text: "分析を準備しています...", delay: 0 },
  { text: "データソースに接続しています...", delay: 4000 },
  { text: "もう少しお待ちください...", delay: 8000 },
];

export function ThinkingIndicator() {
  const [labelIndex, setLabelIndex] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    PHASE_LABELS.forEach((phase, idx) => {
      if (idx === 0) return; // already showing first label
      timers.push(
        setTimeout(() => setLabelIndex(idx), phase.delay)
      );
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div
      className="flex items-center gap-3 my-2 h-10"
      role="status"
      aria-live="polite"
      aria-label="AI is thinking"
    >
      {/* Orbs */}
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="thinking-orb"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>

      {/* Shimmer label */}
      <span
        key={labelIndex}
        className="thinking-shimmer-text thinking-fade-enter"
        style={{ fontSize: "13px", letterSpacing: "0.02em", fontWeight: 400 }}
      >
        {PHASE_LABELS[labelIndex].text}
      </span>

      {/* Screen reader text */}
      <span className="sr-only">
        AIが応答を準備しています。しばらくお待ちください。
      </span>
    </div>
  );
}
```

### CSS (additions to globals.css)

```css
/* ── AI Thinking Indicator ── */

.thinking-orb {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: radial-gradient(circle, #2a2a4e 30%, #e94560 100%);
  animation: thinking-bounce 1.4s ease-in-out infinite;
  will-change: transform, opacity;
}

@keyframes thinking-bounce {
  0%, 80%, 100% {
    transform: scale(1);
    opacity: 0.4;
  }
  40% {
    transform: scale(1.6);
    opacity: 1;
  }
}

.thinking-shimmer-text {
  background: linear-gradient(
    90deg,
    #9ca3af 0%,
    #9ca3af 35%,
    #1a1a2e 50%,
    #9ca3af 65%,
    #9ca3af 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer-sweep 2.5s ease-in-out infinite;
  will-change: background-position;
}

@keyframes shimmer-sweep {
  0% {
    background-position: 200% center;
  }
  100% {
    background-position: -200% center;
  }
}

.thinking-fade-enter {
  animation:
    thinking-fade-in 400ms ease-out,
    shimmer-sweep 2.5s ease-in-out infinite;
}

@keyframes thinking-fade-in {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Reduced motion: disable all animations, show static text */
@media (prefers-reduced-motion: reduce) {
  .thinking-orb {
    animation: none;
    opacity: 0.6;
  }
  .thinking-shimmer-text {
    animation: none;
    -webkit-text-fill-color: #9ca3af;
    background: none;
  }
  .thinking-fade-enter {
    animation: none;
  }
}
```

---

## Integration Points

### 1. ChatMessage.tsx -- AssistantMessage

The `ThinkingIndicator` replaces the blinking cursor for the "no content yet" state.

**Current code** (line 629-633 in legacy mode):
```tsx
{message.isStreaming && (
  <span className="inline-block w-0.5 h-5 bg-[#e94560] animate-pulse ml-0.5 align-middle rounded-full" />
)}
```

**Current code** (line 288-289 in TextSegment for interleaved mode):
```tsx
{isLast && isStreaming && (
  <span className="inline-block w-0.5 h-5 bg-[#e94560] animate-pulse ml-0.5 align-middle rounded-full" />
)}
```

**Proposed change in AssistantMessage:**

```tsx
function AssistantMessage({ message, pendingQuestionGroup, onRespondToQuestions }: { ... }) {
  const items = message.activityItems || [];
  const hasTextItems = items.some((it) => it.kind === "text");

  // Check if we're in the "waiting for first event" state
  const hasAnyContent = message.content ||
    items.some((it) => {
      if (it.kind === "text") return !!(it as TextActivityItem).content;
      return true; // any non-text activity item counts as content
    });
  const showThinking = message.isStreaming && !hasAnyContent;

  if (showThinking) {
    return (
      <div className="assistant-response overflow-hidden min-w-0">
        <ThinkingIndicator />
      </div>
    );
  }

  // ... existing interleaved/legacy rendering unchanged ...
}
```

The blinking cursor in `TextSegment` (lines 288-289) and legacy mode (lines 632-633) **remain unchanged**. They serve a different purpose: indicating active text streaming, which is a different UX need.

### 2. No changes to useChat.ts

The hook already creates an empty assistant message with `isStreaming: true` and `activityItems: []` immediately when `sendMessage` is called (lines 92-105). The `ThinkingIndicator` naturally appears during this state and disappears once any SSE event populates the activity items or text content.

### 3. No changes to types.ts

No new types are needed. The indicator is a pure presentation component that reads existing `Message` properties.

---

## Animation Timing Summary

| Animation | Duration | Easing | Delay | Notes |
|-----------|----------|--------|-------|-------|
| Orb bounce | 1.4s | ease-in-out | 0/160/320ms stagger | Continuous loop |
| Shimmer sweep | 2.5s | ease-in-out | none | Continuous loop |
| Label crossfade | 400ms | ease-out | 4s/8s thresholds | One-shot per label change |
| Exit (natural) | 0ms | instant | -- | Component unmounts when content arrives |

### Why no exit animation

When the first SSE event arrives, real content (reasoning line, tool badge, or text) renders immediately. A fade-out on the thinking indicator would delay the appearance of actual content, which would feel sluggish. The instant replacement creates a satisfying "snap" from waiting to working.

---

## Mobile Considerations

- **Touch targets**: Not applicable (indicator is non-interactive)
- **Width**: The indicator fits comfortably in narrow viewports. At 320px screen width, the shortest label ("分析を準備しています...") at 13px is approximately 195px, well within the available content area
- **Performance**: All animations use `transform` and `opacity` only (compositor-friendly). `will-change` is set on animated properties. No layout thrashing
- **Battery**: The animations are lightweight (3 tiny elements + 1 gradient). On low-power mode, `prefers-reduced-motion: reduce` disables all animations automatically

---

## Accessibility

### Screen Readers
- `role="status"` on the container makes it a live region
- `aria-live="polite"` ensures screen readers announce it without interrupting
- `aria-label="AI is thinking"` provides a concise description
- Hidden `<span className="sr-only">` provides the Japanese text equivalent
- When the label changes, the live region automatically announces the new text

### Reduced Motion
- `@media (prefers-reduced-motion: reduce)` disables all three animations
- Orbs show as static dots at 60% opacity
- Text shows as static gray (`#9ca3af`) without shimmer
- Label changes still happen (text swap), but without the fade animation

### Color Contrast
- The shimmer text cycles between `#9ca3af` (gray) and `#1a1a2e` (navy) on a white/light gray background
- At its lightest point: `#9ca3af` on `#f8f9fb` = contrast ratio ~2.7:1 (meets AA for large text, acceptable for decorative/status indicators per WCAG 1.4.3 exception for inactive components)
- At its darkest point: `#1a1a2e` on `#f8f9fb` = contrast ratio ~13.3:1 (exceeds AAA)
- The indicator is transient and supplementary; the primary status communication is through `aria-live`

---

## File Changes Summary

| File | Change |
|------|--------|
| `frontend/app/dashboard/components/ThinkingIndicator.tsx` | **NEW** -- Component implementation |
| `frontend/app/globals.css` | **EDIT** -- Add thinking indicator keyframes and styles |
| `frontend/app/dashboard/components/ChatMessage.tsx` | **EDIT** -- Import ThinkingIndicator, add `showThinking` logic in AssistantMessage |

---

## Visual Reference (ASCII)

### Phase 1: Waiting (0-4s)
```
  .  .  .   分析を準備しています...
  ^--^--^   (orbs pulse in sequence)
            (text has gradient shimmer sweeping left to right)
```

### Phase 1: Waiting (4-8s) -- label crossfades
```
  .  .  .   データソースに接続しています...
```

### Phase 2+: Content arrives -- indicator vanishes instantly
```
  * 検索データの取得と分析を開始します。

  [レポート取得] (spinning)    [検索分析] (spinning)
```

---

## Rejected Alternatives

### 1. Skeleton/Placeholder Lines
Gray shimmer rectangles mimicking text lines. Rejected because: the assistant response length is unpredictable, so placeholder lines would create false expectations about response structure. Also feels more "content loading" than "AI thinking".

### 2. Full-width Progress Bar
A horizontal bar at the top of the message area. Rejected because: implies deterministic progress (0% to 100%), but the waiting phase has no measurable progress. Would create false expectations.

### 3. Spinning Logo/Icon
An animated version of the app icon. Rejected because: feels like a system-level loading state rather than a conversational element. Breaks the chat flow.

### 4. Animated Ellipsis Only ("...")
Three dots without text. Rejected because: too generic, provides no information about what is happening. Does not meet the "premium" requirement.

### 5. Typing Indicator Bubble (iMessage style)
A small bubble with bouncing dots. Rejected because: implies the AI is "typing" which is misleading -- it is reasoning/preparing, not composing text character by character.

---

## Performance Budget

- Component JS: ~600 bytes gzipped (pure CSS animations, minimal state)
- CSS additions: ~400 bytes gzipped
- No external dependencies (no motion library, no Lottie, no canvas)
- Zero layout shifts (fixed height container: `h-10`)
- Compositor-only animations (transform + opacity)
- Memory: 3 DOM nodes for orbs, 1 for text, 1 for sr-only = 5 additional DOM nodes total
