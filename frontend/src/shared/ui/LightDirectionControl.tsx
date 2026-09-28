import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import './LightDirectionControl.css';

export interface LightDirection {
  x: number;
  y: number;
}

interface LightDirectionControlProps {
  direction: LightDirection;
  onClose: () => void;
  onDirectionChange: (direction: LightDirection) => void;
}

function clampToUnitCircle(x: number, y: number): LightDirection {
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

/** Application-owned, keyboard-accessible control for RTI illumination direction. */
export default function LightDirectionControl({ direction, onClose, onDirectionChange }: LightDirectionControlProps) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  const updateFromClientPoint = (clientX: number, clientY: number) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    onDirectionChange(clampToUnitCircle(
      (2 * (clientX - rect.left)) / rect.width - 1,
      1 - (2 * (clientY - rect.top)) / rect.height,
    ));
  };

  const onHeaderPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
  };

  const onHeaderPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition({ x: Math.max(8, event.clientX - drag.offsetX), y: Math.max(8, event.clientY - drag.offsetY) });
  };

  const onHeaderPointerEnd = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromClientPoint(event.clientX, event.clientY);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateFromClientPoint(event.clientX, event.clientY);
    }
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
    <section className="ocra-light-direction-control" aria-label="Light direction" style={position ? { left: position.x, top: position.y } : undefined} onPointerDown={(event) => event.stopPropagation()}>
      <header className="ocra-light-direction-control__header" onPointerDown={onHeaderPointerDown} onPointerMove={onHeaderPointerMove} onPointerUp={onHeaderPointerEnd} onPointerCancel={onHeaderPointerEnd}>
        <span className="ocra-light-direction-control__drag-handle bi bi-grip-horizontal" aria-label="Drag light control" />
        <button type="button" className="ocra-light-direction-control__close" onClick={onClose} aria-label="Close light direction control">
          <span className="bi bi-x-lg" aria-hidden="true" />
        </button>
      </header>
      <div
        ref={padRef}
        className="ocra-light-direction-control__pad"
        role="slider"
        tabIndex={0}
        aria-label="Light direction"
        aria-valuetext={`Horizontal ${direction.x.toFixed(2)}, vertical ${direction.y.toFixed(2)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <span className="ocra-light-direction-control__axis ocra-light-direction-control__axis--vertical" />
        <span className="ocra-light-direction-control__axis ocra-light-direction-control__axis--horizontal" />
        <span className="ocra-light-direction-control__halo" />
        <span
          className="ocra-light-direction-control__dot"
          style={{ left: `${(direction.x + 1) * 50}%`, top: `${(1 - direction.y) * 50}%` }}
          aria-hidden="true"
        />
      </div>
      <footer className="ocra-light-direction-control__footer">
        <button type="button" onClick={() => onDirectionChange({ x: 0, y: 0 })} aria-label="Reset light direction" title="Reset light direction">
          <span className="bi bi-arrow-counterclockwise" aria-hidden="true" />
        </button>
      </footer>
    </section>
  );
}
