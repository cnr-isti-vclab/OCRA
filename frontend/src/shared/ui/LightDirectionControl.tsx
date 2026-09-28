import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import './LightDirectionControl.css';

export interface LightDirection {
  x: number;
  y: number;
}

interface LightDirectionControlProps {
  direction: LightDirection;
  acquisitionLightDirections: readonly LightDirection[];
  onDirectionChange: (direction: LightDirection) => void;
}

function clampToUnitCircle(x: number, y: number): LightDirection {
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

/** Application-owned, keyboard-accessible control for RTI illumination direction. */
export default function LightDirectionControl({ direction, acquisitionLightDirections, onDirectionChange }: LightDirectionControlProps) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  const updateFromClientPoint = (clientX: number, clientY: number) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    onDirectionChange(clampToUnitCircle(
      (2 * (clientX - rect.left)) / rect.width - 1,
      1 - (2 * (clientY - rect.top)) / rect.height,
    ));
  };

  const isLightCursor = (element: HTMLDivElement, clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    const cursorX = rect.left + ((direction.x + 1) * rect.width) / 2;
    const cursorY = rect.top + ((1 - direction.y) * rect.height) / 2;
    return Math.hypot(clientX - cursorX, clientY - cursorY) <= 15;
  };

  const isDragBorder = (element: HTMLDivElement, clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    return !isLightCursor(element, clientX, clientY)
      && Math.hypot(clientX - rect.left - rect.width / 2, clientY - rect.top - rect.height / 2) >= rect.width / 2 - 10;
  };

  const updateCursor = (element: HTMLDivElement, clientX: number, clientY: number, dragging = false) => {
    element.style.cursor = dragging ? 'grabbing' : isDragBorder(element, clientX, clientY) ? 'grab' : 'crosshair';
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const isDragging = isDragBorder(event.currentTarget, event.clientX, event.clientY);
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (isDragging) {
      const rect = event.currentTarget.getBoundingClientRect();
      updateCursor(event.currentTarget, event.clientX, event.clientY, true);
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      return;
    }
    updateFromClientPoint(event.clientX, event.clientY);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      updateCursor(event.currentTarget, event.clientX, event.clientY);
      return;
    }
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      updateCursor(event.currentTarget, event.clientX, event.clientY, true);
      const viewerRect = event.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
      if (!viewerRect) return;
      setPosition({
        x: Math.max(8, event.clientX - viewerRect.left - drag.offsetX),
        y: Math.max(8, event.clientY - viewerRect.top - drag.offsetY),
      });
      return;
    }
    updateFromClientPoint(event.clientX, event.clientY);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    updateCursor(event.currentTarget, event.clientX, event.clientY);
  };

  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) event.currentTarget.style.cursor = 'crosshair';
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.035;
    let { x, y } = direction;
    if (event.key === 'ArrowLeft') x -= step;
    else if (event.key === 'ArrowRight') x += step;
    else if (event.key === 'ArrowUp') y += step;
    else if (event.key === 'ArrowDown') y -= step;
    else return;
    event.preventDefault();
    onDirectionChange(clampToUnitCircle(x, y));
  };

  return (
    <section className="ocra-light-direction-control" aria-label="Light direction" style={position ? { left: position.x, top: position.y, bottom: 'auto' } : undefined} onPointerDown={(event) => event.stopPropagation()}>
      <div
        ref={padRef}
        className="ocra-light-direction-control__pad"
        role="slider"
        tabIndex={0}
        aria-label="Light direction"
        aria-valuetext={`Horizontal ${direction.x.toFixed(2)}, vertical ${direction.y.toFixed(2)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
      >
        <span className="ocra-light-direction-control__axis ocra-light-direction-control__axis--vertical" />
        <span className="ocra-light-direction-control__axis ocra-light-direction-control__axis--horizontal" />
        <span className="ocra-light-direction-control__halo" />
        {acquisitionLightDirections.length > 0 ? (
          <svg className="ocra-light-direction-control__samples" viewBox="0 0 100 100" aria-label="Acquisition light positions">
            {acquisitionLightDirections.map((sample, index) => (
              <circle key={index} cx={(sample.x + 1) * 50} cy={(1 - sample.y) * 50} r="1.7" />
            ))}
          </svg>
        ) : null}
        <span
          className="ocra-light-direction-control__dot"
          style={{ left: `${(direction.x + 1) * 50}%`, top: `${(1 - direction.y) * 50}%` }}
          aria-hidden="true"
        />
      </div>
    </section>
  );
}
