import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { centreOn, clampPan, type PanFocus } from "./pan-geometry";

export type { PanFocus };

export interface PanZoom {
  /** The clipping box. Its size bounds how far the plan may be dragged. */
  frameRef: React.RefObject<HTMLDivElement | null>;
  /** The scaled content. Its transform is written directly, never through React state. */
  contentRef: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  panning: boolean;
  pannable: boolean;
}

/**
 * Zoom about the centre, drag to pan, and keep the plan inside its frame.
 *
 * The transform is written straight to the DOM rather than held in state: a drag fires a
 * pointer event per frame, and re-rendering the markers and three panels at that rate drops
 * frames.
 *
 * Centring on a selected unit uses the same offset a drag would produce, so the two cannot
 * fight each other.
 */
export function usePanZoom(
  zoom: number,
  /** Changes when the operator picks a different unit, not when that unit moves. */
  focusKey: string | null,
  focus: React.RefObject<PanFocus | null>,
): PanZoom {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);

  const pannable = zoom > 1;

  const write = useCallback(
    (animated: boolean) => {
      const content = contentRef.current;
      if (!content) return;
      content.style.transition = animated ? "transform .3s ease" : "none";
      content.style.transform = `translate(${offset.current.x}px, ${offset.current.y}px) scale(${zoom})`;
    },
    [zoom],
  );

  const clamp = useCallback(
    (next: { x: number; y: number }) => {
      const frame = frameRef.current;
      if (!frame) return { x: 0, y: 0 };
      return clampPan(next, frame.getBoundingClientRect(), zoom);
    },
    [zoom],
  );

  // Re-centre when the zoom or the selection changes, and at no other time. Keying this on
  // the unit's position instead would recentre on every telemetry frame, dragging the view
  // out from under an operator who had just panned somewhere else.
  useEffect(() => {
    const frame = frameRef.current;
    // Reading focusKey here is what ties the effect to the selection changing rather than to
    // the selected unit moving, and nothing is centred when nothing is selected.
    const target = focusKey ? focus.current : null;

    offset.current =
      frame && target ? centreOn(target, frame.getBoundingClientRect(), zoom) : { x: 0, y: 0 };
    write(true);
  }, [zoom, focusKey, focus, write]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // The plan's SVG fills the frame, so the press always lands on a child rather than on
      // the frame itself. What actually has to be excluded is a marker: those are buttons
      // layered over the plan, and pressing one selects a unit instead of starting a drag.
      if (!pannable || !event.isPrimary || event.button !== 0) return;
      if ((event.target as Element).closest("button")) return;

      // Stops the browser starting its own text or image drag over the plan's labels.
      event.preventDefault();

      const start = { x: event.clientX, y: event.clientY };
      const from = { ...offset.current };
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);
      setPanning(true);

      const move = (moveEvent: PointerEvent) => {
        offset.current = clamp({
          x: from.x + (moveEvent.clientX - start.x),
          y: from.y + (moveEvent.clientY - start.y),
        });
        write(false);
      };

      const end = () => {
        setPanning(false);
        element.releasePointerCapture(event.pointerId);
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", end);
        element.removeEventListener("pointercancel", end);
      };

      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", end);
      element.addEventListener("pointercancel", end);
    },
    [pannable, clamp, write],
  );

  return { frameRef, contentRef, onPointerDown, panning, pannable };
}
